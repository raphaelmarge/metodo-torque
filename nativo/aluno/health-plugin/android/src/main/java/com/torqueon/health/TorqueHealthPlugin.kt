package com.torqueon.health

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

@CapacitorPlugin(name = "TorqueHealth")
class TorqueHealthPlugin : Plugin() {
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val kinds = mapOf(
        "workouts" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        "steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class)
    )
    private fun selected(call: PluginCall, key: String): Set<String> {
        val array = call.getArray(key) ?: throw IllegalArgumentException("Categorias ausentes")
        val result = (0 until array.length()).map { array.getString(it) }.toSet()
        require(result.isNotEmpty() && result.all { kinds.containsKey(it) })
        return result
    }
    private fun client(): HealthConnectClient {
        require(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
        return HealthConnectClient.getOrCreate(context)
    }
    @PluginMethod fun capabilities(call: PluginCall) {
        val available = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        call.resolve(JSObject().put("available", available).put("platform", "android").put("kinds", JSArray(kinds.keys.toList())).put("reason", if (available) "" else "Instale ou atualize o Health Connect nos ajustes do Android."))
    }
    @PluginMethod fun request(call: PluginCall) {
        try {
            client()
            require((call.getArray("write")?.length() ?: 0) == 0)
            val permissions = selected(call, "read").map { kinds.getValue(it) }.toSet()
            val contract = PermissionController.createRequestPermissionResultContract()
            startActivityForResult(call, contract.createIntent(context, permissions), "permissionsResult")
        } catch (_: Exception) { call.reject("Não foi possível solicitar acesso à saúde.") }
    }
    @ActivityCallback private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        call?.resolve(JSObject().put("requested", true))
    }
    @PluginMethod fun permissions(call: PluginCall) {
        work.launch {
            try {
                val selected = selected(call, "read")
                val granted = client().permissionController.getGrantedPermissions()
                val output = JSObject()
                for (kind in selected) output.put(kind, if (granted.contains(kinds.getValue(kind))) "granted" else "denied")
                call.resolve(output)
            } catch (_: Exception) { call.reject("Não foi possível conferir as permissões de saúde.") }
        }
    }
    private fun base(kind: String, id: String, start: Instant, end: Instant, day: String): JSObject =
        JSObject().put("kind",kind).put("id",id).put("source","health-connect").put("start",start.toString()).put("end",end.toString()).put("day",day)
    @PluginMethod fun read(call: PluginCall) {
        work.launch {
            try {
                val requested = selected(call, "kinds")
                val start = Instant.parse(call.getString("start"))
                val end = Instant.parse(call.getString("end"))
                require(start < end && Duration.between(start,end).seconds <= 8*86400)
                val hc = client()
                val granted = hc.permissionController.getGrantedPermissions()
                // Check again immediately before each batch; OS also rejects a
                // query if permission is revoked during execution.
                require(requested.all { granted.contains(kinds.getValue(it)) })
                val records = JSArray()
                val zone = ZoneId.systemDefault()
                if (requested.contains("workouts")) {
                    var next: String? = null
                    var count = 0
                    do {
                        val page = hc.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(start,end), pageSize=500, pageToken=next))
                        for (r in page.records) {
                            val mod = when (r.exerciseType) { ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "corrida"; ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "caminhada"; ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "bike"; else -> null } ?: continue
                            val day = r.startTime.atZone(zone).toLocalDate().toString()
                            records.put(base("workouts",r.metadata.id,r.startTime,r.endTime,day).put("seconds",Duration.between(r.startTime,r.endTime).seconds).put("timeBasis","elapsed").put("mod",mod).put("name",r.title ?: "Do relógio · $mod"))
                        }
                        count += page.records.size
                        next = page.pageToken
                        require(count <= 10000) { "Leitura incompleta" }
                    } while (next != null)
                }
                var date = start.atZone(zone).toLocalDate()
                while (date <= end.atZone(zone).toLocalDate()) {
                    val a = maxOf(start,date.atStartOfDay(zone).toInstant())
                    val b = minOf(end,date.plusDays(1).atStartOfDay(zone).toInstant())
                    if (a < b) {
                        if (requested.contains("steps")) {
                            // OS aggregation avoids adding raw overlapping
                            // step samples from phone and watch twice.
                            val aggregate = hc.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL),TimeRangeFilter.between(a,b)))
                            aggregate[StepsRecord.COUNT_TOTAL]?.let { records.put(base("steps",date.toString(),a,b,date.toString()).put("value",it).put("aggregate",true)) }
                        }
                        if (requested.contains("sleep")) {
                            val aggregate = hc.aggregate(AggregateRequest(setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),TimeRangeFilter.between(a,b)))
                            aggregate[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { records.put(base("sleep",date.toString(),a,b,date.toString()).put("value",it.seconds).put("aggregate",true)) }
                        }
                    }
                    date = date.plusDays(1)
                }
                call.resolve(JSObject().put("records",records).put("truncated",false))
            } catch (_: Exception) { call.reject("Não foi possível ler a saúde. Confira as permissões e tente novamente.") }
        }
    }
    @PluginMethod fun settings(call: PluginCall) {
        try { activity.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS));call.resolve(JSObject().put("opened",true)) }
        catch (_: Exception) { call.resolve(JSObject().put("opened",false)) }
    }
    override fun handleOnDestroy() { work.cancel();super.handleOnDestroy() }
}
