/**
 * Arayüz dilleri: Türkçe ve İngilizce. Saf modül (React'sız, testli): sözlükler, çeviri fonksiyonu ve tarayıcı
 * diline göre varsayılan dil seçimi. Bileşenler `useT()` (store.ts) ile kullanır.
 *
 * Yer tutucular: `{n}` parametrenin değeriyle değişir. `{n|tekil|çoğul}` sayı 1 ise "tekil", değilse "çoğul"
 * yazar (İngilizce çoğul ekleri için; sayının kendisi yazılmaz).
 */

export type Lang = 'tr' | 'en';

export const LANGS: readonly Lang[] = ['tr', 'en'];

/** Dil seçicide her dil kendi adıyla görünür. */
export const LANG_NAME: Record<Lang, string> = { tr: 'Türkçe', en: 'English' };

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Varsayılan dil: tarayıcı dili "tr" ile başlıyorsa Türkçe, değilse (bilinmiyorsa da) İngilizce. */
export function defaultLang(browserLanguage: string | null | undefined): Lang {
  return typeof browserLanguage === 'string' && browserLanguage.trim().toLowerCase().startsWith('tr')
    ? 'tr'
    : 'en';
}

/** Tarayıcının dili (yoksa undefined). */
export function browserLanguage(): string | undefined {
  try {
    return typeof navigator === 'undefined' ? undefined : navigator.language;
  } catch {
    return undefined;
  }
}

const tr = {
  'app.name': 'Ajan Ofisi',

  'conn.demoTitle': 'Tarayıcıda çalışan demo (sunucu yok, uydurma veriler)',
  'conn.localTitle': 'Yerel sunucuya bağlı (127.0.0.1)',
  'conn.live': 'canlı',
  'conn.connecting': 'bağlanıyor…',
  'conn.retry': 'bağlantı yok · {s} sn içinde yeniden deneniyor',

  'picker.project': 'Proje',
  'picker.projectAria': 'Gösterilecek proje',
  'picker.all': 'Tüm projeler',

  'summary.sessions': '{n} oturum',
  'summary.working': '{n} çalışıyor',
  'summary.helpers': '{n} yardımcı',

  'detail.aria': 'Ajan ayrıntıları',
  'detail.close': 'Ayrıntıları kapat',
  'detail.status': 'Durum',
  'detail.now': 'Şu an',
  'detail.project': 'Proje',
  'detail.where': 'Nerede',
  'detail.lead': 'Lideri',
  'detail.type': 'Tür',
  'detail.uptime': 'Çalışma süresi',
  'detail.recent': 'Son işlemler',

  'feed.aria': 'Canlı işlem akışı',

  'loading.demo': 'Demo ofis hazırlanıyor…',
  'loading.server': 'Yerel sunucu bekleniyor…',
  'loading.hintBefore': 'Sunucu kapalıysa proje klasöründe ',
  'loading.hintAfter': ' çalıştır.',

  'top.demoBadge': 'Canlı demo · uydurma veriler',
  'top.demoBadgeTitle': 'GitHub deposunu aç',
  'top.wholeOffice': 'Tüm ofis',
  'top.wholeOfficeTitle': 'Kamerayı tüm ofise döndür',
  'top.saveImage': 'Görüntü kaydet',
  'top.saveImageTitle': 'Ofisin o anki görünümünü PNG olarak indir',
  'top.hidePanel': 'Paneli gizle',
  'top.agents': 'Ajanlar',

  'layout.edit': 'Düzenle',
  'layout.editAria': 'Düzeni düzenle',
  'layout.editTitle': 'Masa adalarını sürükleyerek yerleştir',
  'layout.aria': 'Düzen düzenleme',
  'layout.help': 'Masa adalarını sürükleyip bırak. Yeşil yere bırakılabilir, kırmızıya bırakılamaz.',
  'layout.island': 'Ada',
  'layout.islandAria': 'Taşınacak ada',
  'layout.nudgeAria': 'Seçili adayı taşı',
  'layout.left': 'Sola taşı',
  'layout.up': 'Pencereye doğru taşı',
  'layout.down': 'Öne taşı',
  'layout.right': 'Sağa taşı',
  'layout.reset': 'Varsayılana dön',
  'layout.done': 'Bitti',
  'layout.note.ok': 'Ada taşındı.',
  'layout.note.blocked': 'Buraya konamaz: odanın dışında ya da başka bir adaya çok yakın.',
  'layout.note.path': 'Buraya konamaz: kapıdan bazı masalara yol kapanıyor.',
  'layout.note.reset': 'Düzen varsayılana döndü.',

  'list.hideOffline': 'Kapalıları gizle',
  'list.roleFilter': 'Rol filtresi',
  'list.all': 'Hepsi',
  'list.emptyFiltered': 'Bu rollerde çalışan yok. Filtreyi "Hepsi" yaparak herkesi görebilirsin.',
  'list.emptyHidden': 'Açık oturum yok. Kapalı olanları görmek için "Kapalıları gizle"yi kapat.',
  'list.empty': 'Şu an açık bir Claude oturumu yok. Bir oturum başlattığında burada belirecek.',
  'list.agents': '{n} ajan',
  'list.idleMembers': '{n} üye boşta',
  'list.hidden': '{n} gizli',
  'list.absentTitle': 'Ekipte tanımlı, şu an çalışmıyor',

  'status.thinking': 'düşünüyor',
  'status.reading': 'okuyor',
  'status.writing': 'yazıyor',
  'status.terminal': 'terminalde',
  'status.searching': 'arıyor',
  'status.delegating': 'görev dağıtıyor',
  'status.messaging': 'mesaj gönderiyor',
  'status.asking': 'seni bekliyor',
  'status.working': 'çalışıyor',
  'status.error': 'hata',
  'status.idle': 'boşta',
  'status.offline': 'kapalı',
  'status.finished': 'işini bitirdi',

  'role.lead': 'Takım lideri',
  'role.designer': 'Tasarımcı',
  'role.developer': 'Geliştirici',
  'role.tester': 'Test uzmanı',
  'role.reviewer': 'İnceleyici',
  'role.researcher': 'Araştırmacı',
  'role.architect': 'Mimar',
  'role.other': 'Ekip üyesi',

  'group.lead': 'Liderler',
  'group.designer': 'Tasarım',
  'group.developer': 'Geliştirme',
  'group.tester': 'Test',
  'group.reviewer': 'İnceleme',
  'group.researcher': 'Araştırma',
  'group.architect': 'Mimari',
  'group.other': 'Ekip',

  'icon.mail': 'mesaj',
  'icon.tasks': 'görev',
  'icon.check': 'tamamlandı',
  'icon.coffee': 'kahve',
  'icon.thought': 'düşünüyor',
  'icon.question': 'seni bekliyor',
  'icon.book': 'okuyor',
  'icon.pen': 'yazıyor',
  'icon.terminal': 'terminalde',
  'icon.search': 'arıyor',
  'icon.gear': 'çalışıyor',
  'icon.alert': 'hata',
  'icon.moon': 'kapalı',

  'time.seconds': '{n} sn',
  'time.minutes': '{n} dk',
  'time.hours': '{n} sa',
  'time.hoursMinutes': '{h} sa {m} dk',
  'time.justNow': 'az önce',
  'time.minutesAgo': '{n} dk önce',
  'time.hoursAgo': '{n} sa önce',
  'time.daysAgo': '{n} gün önce',

  'seat.away': 'masada değil',

  'build.error': 'Hata var',
  'build.asking': 'Seni bekliyor',
  'build.busy': 'Her şey yolunda',
  'build.quiet': 'Sakin',

  'ops.title': 'Canlı durum',
  'ops.working': 'çalışıyor',
  'ops.idle': 'boşta',
  'ops.actions': 'işlem · 10 dk',
  'ops.last10': 'son 10 dakika',
  'kanban.todo': 'Yapılacak',
  'kanban.doing': 'Yapılıyor',
  'kanban.done': 'Bitti',
  'entrance.today': 'Bugün ofiste · {n}',

  'brand.word': 'AJAN OFİSİ',
  'brand.tagline': 'YAPAY ZEKÂ EKİBİ',
  'brand.welcome': 'HOŞ GELDİNİZ',

  'settings.title': 'Ayarlar',
  'settings.close': 'Ayarları kapat',
  'settings.language': 'Dil (Language)',
  'settings.appearance': 'Görünüm',
  'settings.theme': 'Tema',
  'settings.brand': 'Marka',
  'settings.brandPlain': 'Sade',
  'settings.motion': 'Hareket',
  'settings.motion.system': 'Sistem gibi',
  'settings.motion.reduce': 'Azalt',
  'settings.motion.full': 'Tam',
  'settings.motionHint':
    'Azaltınca karakterler yürümek yerine solup yeniden belirir, süslü animasyonlar durur.',
  'settings.motionSystemReduced': ' Bilgisayarında şu an azaltılmış.',
  'settings.motionSystemFull': ' Bilgisayarında şu an tam.',
  'settings.lowPower': 'Düşük güç modu',
  'settings.lowPowerHint': 'Pil ve ısı için: daha az kare, parlama ve gölge kapalı, ekranlar yavaş.',
  'settings.characters': 'Karakterler',
  'settings.role': 'Rol',
  'settings.custom': ' (özel)',
  'settings.outfit': 'Kıyafet rengi',
  'settings.outfitAuto': 'Otomatik',
  'settings.outfitAutoTitle': 'Otomatik (role göre)',
  'settings.accessories': 'Rol aksesuarı',
  'settings.accessoriesHint': 'Kravat, yelek, kulaklık, bere, gözlük gibi role özgü eşyalar.',
  'settings.mascot': 'Maskot',
  'settings.mascotNone': 'Yok',
  'settings.mascotAria': '{project} maskotu',
  'settings.mascotHint': '{project} ofisinde dolaşır, ara sıra oturup dinlenir.',
  'settings.privacy': 'Gizlilik',
  'settings.hideFiles': 'Dosya adlarını gizle',
  'settings.hideFilesHint': 'Ekran paylaşırken işe yarar: yalnızca işlem türü görünür, ör. “Edit”.',
  'settings.showTitles': 'Oturum başlıklarını göster',
  'settings.showTitlesHint':
    "Claude'un her oturuma verdiği kısa özet başlık. Kapatınca yalnızca oturum adı görünür.",
  'settings.listOffice': 'Liste ve ofis',
  'settings.hideOfflineHint':
    'Kapalı oturumlar, işini bitiren yardımcılar ve masada olmayan ekip üyeleri gösterilmez.',
  'settings.sound': 'Ses',
  'settings.soundAlerts': 'Sesli uyarılar',
  'settings.soundHint':
    'Biri seni beklediğinde, yardımcı işini bitirdiğinde ve oturumlar arası mesaj geldiğinde kısa bir ses.',
  'settings.volume': 'Ses düzeyi',
  'settings.volumeText': 'yüzde {n}',
  'settings.tryAria': 'Sesleri dene',
  'settings.try': 'Dene',

  'cue.ask': 'Biri seni bekliyor',
  'cue.done': 'Yardımcı işini bitirdi',
  'cue.letter': 'Oturumlar arası mesaj',
  'cueShort.ask': 'Bekliyor',
  'cueShort.done': 'Bitti',
  'cueShort.letter': 'Mesaj',

  'mascotKind.cat': 'Kedi',
  'mascotKind.dog': 'Köpek',
  'mascotKind.robot': 'Robot',

  'outfit.red': 'Kırmızı',
  'outfit.orange': 'Turuncu',
  'outfit.yellow': 'Sarı',
  'outfit.green': 'Yeşil',
  'outfit.teal': 'Turkuaz',
  'outfit.blue': 'Mavi',
  'outfit.purple': 'Mor',
  'outfit.pink': 'Pembe',
  'outfit.white': 'Beyaz',
  'outfit.charcoal': 'Antrasit',

  'theme.gece.name': 'Gece',
  'theme.gece.description': 'Koyu lacivert gece, sıcak amber ışıklar ve ay ışığı; ışıklı gece şehri.',
  'theme.gunisigi.name': 'Gün ışığı',
  'theme.gunisigi.description': 'Açık renk duvarlar, açık meşe parke, güneş ve mavi gök. Neon ışıklar sönük.',
  'theme.kuzey.name': 'Kuzey',
  'theme.kuzey.description': 'Soğuk lacivert gece; ofiste camgöbeği ve mor neon.',
} satisfies Record<string, string>;

export type MessageKey = keyof typeof tr;

/** İngilizce sözlük: tip gereği Türkçe'deki her anahtarı içermek zorunda (fazlası da derlenmez). */
const en: Record<MessageKey, string> = {
  'app.name': 'Agent Office',

  'conn.demoTitle': 'Demo running in the browser (no server, made-up data)',
  'conn.localTitle': 'Connected to the local server (127.0.0.1)',
  'conn.live': 'live',
  'conn.connecting': 'connecting…',
  'conn.retry': 'no connection · retrying in {s} s',

  'picker.project': 'Project',
  'picker.projectAria': 'Project to show',
  'picker.all': 'All projects',

  'summary.sessions': '{n} {n|session|sessions}',
  'summary.working': '{n} working',
  'summary.helpers': '{n} {n|helper|helpers}',

  'detail.aria': 'Agent details',
  'detail.close': 'Close details',
  'detail.status': 'Status',
  'detail.now': 'Now',
  'detail.project': 'Project',
  'detail.where': 'Where',
  'detail.lead': 'Lead',
  'detail.type': 'Type',
  'detail.uptime': 'Running for',
  'detail.recent': 'Recent actions',

  'feed.aria': 'Live activity feed',

  'loading.demo': 'Preparing the demo office…',
  'loading.server': 'Waiting for the local server…',
  'loading.hintBefore': 'If the server is off, run ',
  'loading.hintAfter': ' in the project folder.',

  'top.demoBadge': 'Live demo · made-up data',
  'top.demoBadgeTitle': 'Open the GitHub repository',
  'top.wholeOffice': 'Whole office',
  'top.wholeOfficeTitle': 'Return the camera to the whole office',
  'top.saveImage': 'Save image',
  'top.saveImageTitle': 'Download the current view of the office as a PNG',
  'top.hidePanel': 'Hide panel',
  'top.agents': 'Agents',

  'layout.edit': 'Edit',
  'layout.editAria': 'Edit layout',
  'layout.editTitle': 'Drag the desk islands to arrange them',
  'layout.aria': 'Layout editing',
  'layout.help': 'Drag and drop the desk islands. Green spots are allowed, red ones are not.',
  'layout.island': 'Island',
  'layout.islandAria': 'Island to move',
  'layout.nudgeAria': 'Move the selected island',
  'layout.left': 'Move left',
  'layout.up': 'Move toward the windows',
  'layout.down': 'Move forward',
  'layout.right': 'Move right',
  'layout.reset': 'Reset to default',
  'layout.done': 'Done',
  'layout.note.ok': 'Island moved.',
  'layout.note.blocked': "Can't place it here: outside the room or too close to another island.",
  'layout.note.path': "Can't place it here: it blocks the way from the door to some desks.",
  'layout.note.reset': 'Layout reset to default.',

  'list.hideOffline': 'Hide offline',
  'list.roleFilter': 'Role filter',
  'list.all': 'All',
  'list.emptyFiltered': 'No one is working in these roles. Set the filter to "All" to see everyone.',
  'list.emptyHidden': 'No open sessions. Turn off "Hide offline" to see the closed ones.',
  'list.empty': 'There is no open Claude session right now. It will appear here when you start one.',
  'list.agents': '{n} {n|agent|agents}',
  'list.idleMembers': '{n} {n|member|members} idle',
  'list.hidden': '{n} hidden',
  'list.absentTitle': 'Defined in the team, not working right now',

  'status.thinking': 'thinking',
  'status.reading': 'reading',
  'status.writing': 'writing',
  'status.terminal': 'in terminal',
  'status.searching': 'searching',
  'status.delegating': 'delegating',
  'status.messaging': 'sending a message',
  'status.asking': 'waiting for you',
  'status.working': 'working',
  'status.error': 'error',
  'status.idle': 'idle',
  'status.offline': 'offline',
  'status.finished': 'finished',

  'role.lead': 'Team lead',
  'role.designer': 'Designer',
  'role.developer': 'Developer',
  'role.tester': 'Tester',
  'role.reviewer': 'Reviewer',
  'role.researcher': 'Researcher',
  'role.architect': 'Architect',
  'role.other': 'Team member',

  'group.lead': 'Leads',
  'group.designer': 'Design',
  'group.developer': 'Development',
  'group.tester': 'Testing',
  'group.reviewer': 'Review',
  'group.researcher': 'Research',
  'group.architect': 'Architecture',
  'group.other': 'Team',

  'icon.mail': 'message',
  'icon.tasks': 'task',
  'icon.check': 'done',
  'icon.coffee': 'coffee',
  'icon.thought': 'thinking',
  'icon.question': 'waiting for you',
  'icon.book': 'reading',
  'icon.pen': 'writing',
  'icon.terminal': 'in terminal',
  'icon.search': 'searching',
  'icon.gear': 'working',
  'icon.alert': 'error',
  'icon.moon': 'offline',

  'time.seconds': '{n} s',
  'time.minutes': '{n} min',
  'time.hours': '{n} h',
  'time.hoursMinutes': '{h} h {m} min',
  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} h ago',
  'time.daysAgo': '{n} {n|day|days} ago',

  'seat.away': 'not at desk',

  'build.error': 'Something failed',
  'build.asking': 'Waiting for you',
  'build.busy': 'All good',
  'build.quiet': 'Quiet',

  'ops.title': 'Live status',
  'ops.working': 'working',
  'ops.idle': 'idle',
  'ops.actions': 'actions · 10 min',
  'ops.last10': 'last 10 minutes',
  'kanban.todo': 'To do',
  'kanban.doing': 'Doing',
  'kanban.done': 'Done',
  'entrance.today': 'In the office today · {n}',

  'brand.word': 'AGENT OFFICE',
  'brand.tagline': 'AI TEAM',
  'brand.welcome': 'WELCOME',

  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.language': 'Language (Dil)',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.brand': 'Brand',
  'settings.brandPlain': 'Plain',
  'settings.motion': 'Motion',
  'settings.motion.system': 'Follow system',
  'settings.motion.reduce': 'Reduce',
  'settings.motion.full': 'Full',
  'settings.motionHint':
    'When reduced, characters fade out and reappear instead of walking; fancy animations stop.',
  'settings.motionSystemReduced': ' Currently reduced on your computer.',
  'settings.motionSystemFull': ' Currently full on your computer.',
  'settings.lowPower': 'Low power mode',
  'settings.lowPowerHint': 'For battery and heat: fewer frames, no glow or shadows, slower screens.',
  'settings.characters': 'Characters',
  'settings.role': 'Role',
  'settings.custom': ' (custom)',
  'settings.outfit': 'Outfit color',
  'settings.outfitAuto': 'Automatic',
  'settings.outfitAutoTitle': 'Automatic (by role)',
  'settings.accessories': 'Role accessory',
  'settings.accessoriesHint': 'Role-specific items such as a tie, vest, headphones, beanie or glasses.',
  'settings.mascot': 'Mascot',
  'settings.mascotNone': 'None',
  'settings.mascotAria': '{project} mascot',
  'settings.mascotHint': 'Wanders around the {project} office and sits down to rest now and then.',
  'settings.privacy': 'Privacy',
  'settings.hideFiles': 'Hide file names',
  'settings.hideFilesHint': 'Useful when sharing your screen: only the action type is shown, e.g. “Edit”.',
  'settings.showTitles': 'Show session titles',
  'settings.showTitlesHint':
    'The short summary title Claude gives each session. When off, only the session name is shown.',
  'settings.listOffice': 'List and office',
  'settings.hideOfflineHint':
    'Closed sessions, finished helpers and team members not at their desks are hidden.',
  'settings.sound': 'Sound',
  'settings.soundAlerts': 'Sound alerts',
  'settings.soundHint':
    'A short sound when someone is waiting for you, a helper finishes, or a message arrives between sessions.',
  'settings.volume': 'Volume',
  'settings.volumeText': '{n} percent',
  'settings.tryAria': 'Try the sounds',
  'settings.try': 'Try',

  'cue.ask': 'Someone is waiting for you',
  'cue.done': 'A helper finished',
  'cue.letter': 'Message between sessions',
  'cueShort.ask': 'Waiting',
  'cueShort.done': 'Done',
  'cueShort.letter': 'Message',

  'mascotKind.cat': 'Cat',
  'mascotKind.dog': 'Dog',
  'mascotKind.robot': 'Robot',

  'outfit.red': 'Red',
  'outfit.orange': 'Orange',
  'outfit.yellow': 'Yellow',
  'outfit.green': 'Green',
  'outfit.teal': 'Turquoise',
  'outfit.blue': 'Blue',
  'outfit.purple': 'Purple',
  'outfit.pink': 'Pink',
  'outfit.white': 'White',
  'outfit.charcoal': 'Charcoal',

  'theme.gece.name': 'Night',
  'theme.gece.description': 'Dark navy night, warm amber lights and moonlight; a glowing city at night.',
  'theme.gunisigi.name': 'Daylight',
  'theme.gunisigi.description': 'Light walls, light oak parquet, sun and blue sky. Neon lights dimmed.',
  'theme.kuzey.name': 'North',
  'theme.kuzey.description': 'Cold navy night; cyan and purple neon in the office.',
};

export const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { tr, en };

export type Params = Record<string, string | number>;

/** Yer tutucuları doldurur: `{ad}` → değer, `{ad|tekil|çoğul}` → sayıya göre biri. Eksik parametre olduğu gibi kalır. */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(
    /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,
    (whole, name: string, one: string | undefined, other: string | undefined) => {
      const value = params[name];
      if (value === undefined) return whole;
      if (one !== undefined) return Number(value) === 1 ? one : (other ?? '');
      return String(value);
    },
  );
}

/** Bir dilde çeviri. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  return format(DICTIONARIES[lang][key] ?? DICTIONARIES.tr[key], params);
}

export type Translate = (key: MessageKey, params?: Params) => string;

const TRANSLATORS: Record<Lang, Translate> = {
  tr: (key, params) => translate('tr', key, params),
  en: (key, params) => translate('en', key, params),
};

/** Dile bağlı çeviri fonksiyonu (dil başına tek örnek: React'ta bağımlılık olarak güvenle kullanılır). */
export function translator(lang: Lang): Translate {
  return TRANSLATORS[lang];
}
