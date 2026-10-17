import Foundation
import Capacitor
import HealthKit

@objc(TorqueHealthPlugin)
public class TorqueHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TorqueHealthPlugin"
    public let jsName = "TorqueHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "permissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "settings", returnType: CAPPluginReturnPromise)
    ]
    private let store = HKHealthStore()
    private let iso = ISO8601DateFormatter()
    private let supported: Set<String> = ["workouts", "steps", "sleep"]

    @objc func capabilities(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "platform": "ios", "kinds": Array(supported)])
    }
    private func kinds(_ call: CAPPluginCall, key: String) throws -> [String] {
        let values = call.getArray(key, String.self) ?? []
        guard !values.isEmpty, Set(values).isSubset(of: supported) else { throw NSError(domain: "TorqueHealth", code: 1) }
        return values
    }
    private func types(_ values: [String]) -> Set<HKObjectType> {
        var result = Set<HKObjectType>()
        if values.contains("workouts") { result.insert(HKObjectType.workoutType()) }
        if values.contains("steps"), let t = HKObjectType.quantityType(forIdentifier: .stepCount) { result.insert(t) }
        if values.contains("sleep"), let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { result.insert(t) }
        return result
    }
    @objc func request(_ call: CAPPluginCall) {
        do {
            let selected = try kinds(call, key: "read")
            guard (call.getArray("write", String.self) ?? []).isEmpty, HKHealthStore.isHealthDataAvailable() else { call.reject("Leitura de saúde indisponível."); return }
            store.requestAuthorization(toShare: [], read: types(selected)) { success, error in
                if let error = error { call.reject("Não foi possível solicitar acesso à saúde.", nil, error); return }
                // Completion is NOT proof of read authorization (Apple privacy).
                call.resolve(["requested": success, "readStatus": "unknown"])
            }
        } catch { call.reject("Categorias de saúde inválidas.") }
    }
    @objc func permissions(_ call: CAPPluginCall) {
        do { var result: [String: String] = [:]; for k in try kinds(call, key: "read") { result[k] = "unknown" }; call.resolve(result) }
        catch { call.reject("Categorias de saúde inválidas.") }
    }
    private func parse(_ value: String?) -> Date? {
        guard let value = value else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: value) ?? iso.date(from: value)
    }
    private func day(_ date: Date) -> String {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current; f.dateFormat = "yyyy-MM-dd"; return f.string(from: date)
    }
    private func samples(_ type: HKSampleType, start: Date, end: Date, completion: @escaping ([HKSample]?, Error?) -> Void) {
        let p = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        store.execute(HKSampleQuery(sampleType: type, predicate: p, limit: 10001, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in completion(samples, error) })
    }
    @objc func read(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let start = parse(call.getString("start")), let end = parse(call.getString("end")), start < end, end.timeIntervalSince(start) <= 8*86400 else { call.reject("Período de saúde inválido."); return }
        do {
            let selected = try kinds(call, key: "kinds")
            let group = DispatchGroup(), lock = NSLock()
            var records = [[String: Any]](), failed = false, truncated = false
            func append(_ rows: [[String: Any]], error: Error? = nil, tooMany: Bool = false) { lock.lock(); records.append(contentsOf: rows); failed = failed || error != nil; truncated = truncated || tooMany; lock.unlock() }
            if selected.contains("workouts") {
                group.enter()
                samples(HKObjectType.workoutType(), start: start, end: end) { values, error in
                    let workouts = (values ?? []).compactMap { $0 as? HKWorkout }
                    let rows: [[String: Any]] = workouts.compactMap { w in
                        let mod: String
                        switch w.workoutActivityType { case .running: mod = "corrida"; case .walking: mod = "caminhada"; case .cycling: mod = "bike"; default: return nil }
                        var r: [String: Any] = ["kind":"workouts", "id":w.uuid.uuidString, "source":"healthkit", "start":self.iso.string(from:w.startDate), "end":self.iso.string(from:w.endDate), "day":self.day(w.startDate), "seconds":w.duration, "mod":mod, "name":"Do relógio · " + mod]
                        if let distance = w.totalDistance { r["meters"] = distance.doubleValue(for:.meter()) }
                        return r
                    }; append(rows, error:error, tooMany:workouts.count>10000); group.leave()
                }
            }
            if selected.contains("steps"), let type = HKObjectType.quantityType(forIdentifier: .stepCount) {
                group.enter()
                let anchor = Calendar.current.startOfDay(for:start), p = HKQuery.predicateForSamples(withStart:start,end:end,options:[])
                let q = HKStatisticsCollectionQuery(quantityType:type,quantitySamplePredicate:p,options:.cumulativeSum,anchorDate:anchor,intervalComponents:DateComponents(day:1))
                q.initialResultsHandler = { _, collection, error in
                    var rows = [[String: Any]]()
                    collection?.enumerateStatistics(from:start,to:end) { stat, _ in
                        guard let value = stat.sumQuantity()?.doubleValue(for:.count()) else { return }
                        let d = self.day(stat.startDate)
                        rows.append(["kind":"steps","id":d,"source":"healthkit","day":d,"start":self.iso.string(from:stat.startDate),"end":self.iso.string(from:stat.endDate),"value":value,"aggregate":true])
                    }; append(rows,error:error); group.leave()
                }; store.execute(q)
            }
            if selected.contains("sleep"), let type = HKObjectType.categoryType(forIdentifier:.sleepAnalysis) {
                group.enter()
                samples(type,start:start,end:end) { values,error in
                    var intervals = [(Date,Date)]()
                    for sample in (values ?? []).compactMap({$0 as? HKCategorySample}) {
                        // inBed/awake are not sleep; overlapping devices/stages
                        // are merged before totals, never summed twice.
                        guard sample.value != HKCategoryValueSleepAnalysis.inBed.rawValue, sample.value != HKCategoryValueSleepAnalysis.awake.rawValue else { continue }
                        let a=max(start,sample.startDate),b=min(end,sample.endDate); if a < b { intervals.append((a,b)) }
                    }
                    intervals.sort{$0.0 < $1.0}; var merged=[(Date,Date)]()
                    for range in intervals { if let last=merged.last,last.1 >= range.0 { merged[merged.count-1]=(last.0,max(last.1,range.1)) } else { merged.append(range) } }
                    var totals=[String:Double](),bounds=[String:(Date,Date)]()
                    for range in merged { var cursor=range.0;while cursor < range.1 { let midnight=Calendar.current.startOfDay(for:cursor),next=Calendar.current.date(byAdding:.day,value:1,to:midnight)!,stop=min(next,range.1),d=self.day(cursor);totals[d,default:0]+=stop.timeIntervalSince(cursor);bounds[d]=(midnight,next);cursor=stop } }
                    let rows:[[String:Any]]=totals.map { d,value in ["kind":"sleep","id":d,"source":"healthkit","day":d,"start":self.iso.string(from:bounds[d]!.0),"end":self.iso.string(from:bounds[d]!.1),"value":value,"aggregate":true] }
                    append(rows,error:error,tooMany:(values?.count ?? 0)>10000);group.leave()
                }
            }
            group.notify(queue:.main) { if failed { call.reject("Não foi possível ler a saúde. Confira as permissões e tente novamente.") } else { call.resolve(["records":records,"truncated":truncated]) } }
        } catch { call.reject("Categorias de saúde inválidas.") }
    }
    @objc func settings(_ call: CAPPluginCall) {
        // No public Apple API revokes HealthKit read permissions or opens an
        // app-specific Health page. The web dialog supplies the correct steps.
        call.resolve(["opened":false])
    }
}
