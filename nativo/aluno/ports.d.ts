/** Interfaces propostas; nenhuma implementação de sensores nativos nesta fase. */
export type Permission = 'unknown' | 'granted' | 'denied' | 'unavailable';
export interface Capabilities {
  autonomousWorkout: boolean;
  backgroundWorkout: boolean;
  gps: Permission;
  heartRate: Permission;
  haptics: boolean;
}
export interface WorkoutPort {
  capabilities(): Promise<Capabilities>;
  /** Solicitação explícita pelo usuário; saúde e localização são opcionais. */
  requestPermission(kind: 'gps' | 'heartRate'): Promise<Permission>;
  /** Só iniciar após persistir plano e sessão no dispositivo executor. */
  start(sessionId: string): Promise<void>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  /** Reconcilia sessão do SO após interrupção, sem inferir tempo pela hora civil. */
  recover(sessionId: string): Promise<'active' | 'paused' | 'ended' | 'unknown'>;
  subscribe(listener: (sample: Observation) => void): () => void;
}
export interface Observation {
  /** Cumulativo observado, excluindo pausas; nunca Date.now() - início. */
  elapsedMs: number;
  distanceM: number | null;
  heartRateBpm: number | null;
  position: { lat: number; lng: number; accuracyM: number; segmentId: string } | null;
}
export interface AlertPort {
  /** ID estável por sessão/etapa/transição. Melhor esforço; não garante exactly-once físico. */
  emit(alertId: string, kind: 'interval' | 'pause' | 'finish'): Promise<void>;
}
export interface AtomicStore<Record> {
  read(key: string): Promise<Record | null>;
  /** callback síncrono, serializado entre conexões; resolve apenas após commit durável. */
  update(key: string, change: (previous: Record | null) => Record): Promise<Record>;
}
export interface PairingPort {
  /** Contrato futuro: identificador opaco, nunca o token URL do aluno. */
  deviceBinding(): Promise<{ scopeId: string; deviceId: string; revoked: boolean } | null>;
  revoke(deviceId: string): Promise<void>;
  /** Segredos ficam em Keychain/Keystore; não retornam ao JS, logs ou eventos. */
  clearLocalBinding(): Promise<void>;
}
