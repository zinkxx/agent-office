/**
 * Sunucu ile tarayıcının paylaştığı veri tipleri.
 *
 * Gizlilik: Bu tiplerde mesaj, kod, komut metni ya da tam dosya yolu taşıyan hiçbir alan yoktur.
 * Dosya bilgisi yalnızca dosya ADI olarak (`file`) taşınır.
 */

/** Bir ajanın o anki durumu (ofisteki animasyonu belirler). */
export type AgentStatus =
  | 'thinking' // düşünüyor
  | 'reading' // dosya okuyor
  | 'writing' // dosya yazıyor / düzenliyor
  | 'searching' // arıyor (dosyalarda ya da web'de)
  | 'terminal' // terminal komutu çalıştırıyor
  | 'delegating' // alt ajan başlatıyor
  | 'messaging' // başka bir oturuma mesaj gönderiyor
  | 'asking' // kullanıcıya soru soruyor, cevap bekliyor
  | 'working' // başka bir araç kullanıyor
  | 'error' // az önce hata aldı
  | 'idle' // sırasını bitirdi, bekliyor
  | 'offline'; // kapandı

export type AgentKind = 'session' | 'subagent';

/** Ekipteki rol. Ana oturum her zaman takım lideridir; alt ajanların rolü türünden ya da davranışından çıkarılır. */
export type AgentRole =
  | 'lead' // takım lideri
  | 'designer' // tasarımcı
  | 'developer' // geliştirici
  | 'tester' // test uzmanı
  | 'reviewer' // inceleyici
  | 'researcher' // araştırmacı
  | 'architect' // mimar
  | 'other'; // ekip üyesi

export const AGENT_ROLES: readonly AgentRole[] = [
  'lead',
  'designer',
  'developer',
  'tester',
  'reviewer',
  'researcher',
  'architect',
  'other',
];

/** Bir ajanın yaptığı tek bir işlem (detay panelindeki "son işlemler" listesi). */
export interface Activity {
  /** Araç adı, ör. "Edit". */
  tool: string;
  /** Araç bir dosyayla çalışıyorsa yalnızca dosya adı, ör. "pressable.dart". */
  file?: string;
  /** Unix ms. */
  at: number;
}

export interface Agent {
  /** Ana oturumda sessionId, alt ajanda agentId. */
  id: string;
  /** Ekrandaki ad: oturum adı (ör. "atlas-45") ya da alt ajanın kısa iş tanımı. */
  name: string;
  /** Proje adı, ör. "Atlas". */
  project: string;
  kind: AgentKind;
  role: AgentRole;
  /** Alt ajanın türü (ör. "Explore", "tasarimci"); projede tanımlı özel ajanlarda ekip listesindeki adla aynıdır. */
  agentType?: string;
  /** Alt ajansa bağlı olduğu ana oturumun id'si. */
  parentId?: string;
  /** Ana oturumlarda: terminal mi VS Code mu. */
  entrypoint?: 'cli' | 'claude-vscode' | 'other';
  status: AgentStatus;
  /** Şu anki işlem (varsa). */
  current?: Activity;
  /** Oturumun otomatik başlığı. */
  title?: string;
  startedAt?: number;
  lastActivityAt: number;
  /** En yeni başta, en fazla 20. */
  recent: Activity[];
}

/** Bir oturumdan diğerine gönderilen mesaj (ofiste uçan mektup). İçerik taşımaz. */
export interface Letter {
  id: string;
  fromId: string;
  /** Alıcının oturum adı (ör. "nova-demo"); eşleşen ajan varsa toId dolu olur. */
  toName: string;
  toId?: string;
  at: number;
}

/** Projede `.claude/agents/*.md` ile tanımlı bir ekip üyesi (çalışmasa da masası ofiste durur). */
export interface TeamMember {
  /** Ajanın adı (ön bilgideki `name`, yoksa dosya adı). Alt ajanın `agentType`'ı ile eşleşir. */
  name: string;
  role: AgentRole;
}

export interface Team {
  project: string;
  members: TeamMember[];
}

export interface OfficeSnapshot {
  agents: Agent[];
  /** Görünen projelerin ekip listeleri (yalnızca ad ve rol). */
  teams: Team[];
  /** Son 2 dakikadaki mektuplar. */
  letters: Letter[];
  /** Sunucu saati (ms); tarayıcı süre hesaplarında kullanır. */
  now: number;
}

/** Sunucudan tarayıcıya giden WebSocket mesajı. */
export type ServerMessage = { type: 'snapshot'; snapshot: OfficeSnapshot };
