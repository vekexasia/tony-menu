import type { Env } from '../types';

const now = 1700000000000;

const settings = {
  name: 'Trattoria Demo',
  payoff: 'A living demo menu you can edit safely',
  theme: {
    primaryColor: '#C47A4F',
    backgroundColor: '#FBFAF9',
    textColor: '#1F1A14',
  },
  info: {
    phone: '+39 041 000 0000',
    addressLine1: 'Campo San Demo, 1',
    city: 'Venezia',
    zip: '30100',
    region: 'VE',
    headerImage: '/demo-images/restaurant.jpg',
    menuNotice: {
      enabled: true,
      text: 'Demo data resets automatically. Do not enter real customer data.',
      i18n: {
        it: { text: 'I dati demo vengono azzerati automaticamente. Non inserire dati reali dei clienti.' },
        en: { text: 'Demo data resets automatically. Do not enter real customer data.' },
      },
    },
  },
  socials: {
    instagram: 'https://www.instagram.com/',
    facebook: 'https://www.facebook.com/',
    whatsapp: '+390410000000',
  },
  openingSchedule: {
    open: true,
    minWaitSlot: 15,
    slotDuration: 30,
    maxDaysLookAhead: 7,
    schedule: [
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:00' }],
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:00' }],
      [],
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:00' }],
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:00' }],
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:30' }],
      [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:30' }],
    ],
  },
  promotionAlert: {
    title: 'Demo tasting menu',
    content: 'Try editing this promotion from the admin panel.',
    tillDate: '2030-12-31T22:59:59.999Z',
  },
  chatAgentPrompt: 'You are the friendly assistant for Trattoria Demo. Recommend dishes from the demo menu only.',
  aiChatEnabled: true,
  aiVoiceEnabled: true,
  primaryLocale: 'it',
  enabledLocales: ['it', 'en', 'de', 'fr'],
  disabledLocales: ['es', 'nl', 'ru', 'pt'],
  customLocales: [{ code: 'vec', name: 'Veneto' }],
  publicationState: 'published',
};

const FOOD_MENU_ID = 'demo-menu-food';
const DRINKS_MENU_ID = 'demo-menu-drinks';

const menus = [
  { id: FOOD_MENU_ID, code: 'food', title: 'Food menu', sortOrder: 0, icon: 'utensils', i18n: { it: { title: 'Menu cibo' }, de: { title: 'Speisekarte' }, fr: { title: 'Menu à table' } } },
  { id: DRINKS_MENU_ID, code: 'drinks', title: 'Drinks', sortOrder: 1, icon: 'wine', i18n: { it: { title: 'Bevande' } } },
];

const categories = [
  { id: 'demo-cat-starters', name: 'Starters', sortOrder: 0, i18n: { it: { name: 'Antipasti' }, en: { name: 'Starters' }, de: { name: 'Vorspeisen' }, fr: { name: 'Entrées' } } },
  { id: 'demo-cat-pasta', name: 'Pasta', sortOrder: 1, i18n: { it: { name: 'Primi' }, en: { name: 'Pasta' }, de: { name: 'Pasta' }, fr: { name: 'Pâtes' } } },
  { id: 'demo-cat-mains', name: 'Main courses', sortOrder: 2, i18n: { it: { name: 'Secondi' }, en: { name: 'Main courses' }, de: { name: 'Hauptgerichte' }, fr: { name: 'Plats principaux' }, vec: { name: 'Secondi' } } },
  { id: 'demo-cat-desserts', name: 'Desserts', sortOrder: 3, i18n: { it: { name: 'Dolci' }, en: { name: 'Desserts' }, de: { name: 'Desserts' }, fr: { name: 'Desserts' } } },
  { id: 'demo-cat-wines', name: 'Wine by the glass', sortOrder: 4, i18n: { it: { name: 'Vini al calice' }, en: { name: 'Wine by the glass' }, de: { name: 'Wein im Glas' }, fr: { name: 'Vins au verre' } } },
];

// Categories that belong to the drinks menu (membership is many-to-many on entries; we map by category here for clarity).
const drinkCategoryIds = new Set(['demo-cat-wines']);

const entries = [
  {
    id: 'demo-entry-bruschetta',
    categoryId: 'demo-cat-starters',
    name: 'Tomato bruschetta',
    description: 'Toasted bread, cherry tomatoes, basil and extra virgin olive oil.',
    price: 750,
    imageUrl: '/demo-images/bruschetta.jpg',
    sortOrder: 0,
    allergens: ['Glutine'],
    i18n: {
      it: { name: 'Bruschetta al pomodoro', desc: 'Pane tostato, pomodorini, basilico e olio extravergine.' },
      en: { name: 'Tomato bruschetta', desc: 'Toasted bread, cherry tomatoes, basil and extra virgin olive oil.' },
      de: { name: 'Tomaten-Bruschetta', desc: 'Geröstetes Brot, Kirschtomaten, Basilikum und natives Olivenöl extra.' },
      fr: { name: 'Bruschetta à la tomate', desc: 'Pain grillé, tomates cerises, basilic et huile d’olive extra vierge.' },
      vec: { name: 'Bruscheta al pomodoro', desc: 'Pan brustolà, pomodorini, basìlego e ojo bon.' },
    },
  },
  {
    id: 'demo-entry-carpaccio',
    categoryId: 'demo-cat-starters',
    name: 'Zucchini carpaccio',
    description: 'Marinated zucchini, lemon, mint and almond flakes.',
    price: 950,
    imageUrl: '/demo-images/zucchini.jpg',
    sortOrder: 1,
    allergens: ['Frutta-a-Guscio'],
    i18n: {
      it: { name: 'Carpaccio di zucchine', desc: 'Zucchine marinate, limone, menta e scaglie di mandorla.' },
      en: { name: 'Zucchini carpaccio', desc: 'Marinated zucchini, lemon, mint and almond flakes.' },
      de: { name: 'Zucchini-Carpaccio', desc: 'Marinierte Zucchini, Zitrone, Minze und Mandelblättchen.' },
      fr: { name: 'Carpaccio de courgettes', desc: 'Courgettes marinées, citron, menthe et copeaux d’amande.' },
      vec: { name: 'Carpacio de suchine', desc: 'Suchine marinàe, limon, menta e mandorle a scaie.' },
    },
  },
  {
    id: 'demo-entry-polpo',
    categoryId: 'demo-cat-starters',
    name: 'Grilled octopus',
    description: 'Crispy octopus with potato cream, parsley and lemon oil.',
    price: 1350,
    imageUrl: '/demo-images/polpo.jpg',
    sortOrder: 2,
    allergens: ['Molluschi'],
    i18n: {
      it: { name: 'Polpo alla griglia', desc: 'Polpo croccante con crema di patate, prezzemolo e olio al limone.' },
      en: { name: 'Grilled octopus', desc: 'Crispy octopus with potato cream, parsley and lemon oil.' },
      de: { name: 'Gegrillter Oktopus', desc: 'Knuspriger Oktopus mit Kartoffelcreme, Petersilie und Zitronenöl.' },
      fr: { name: 'Poulpe grillé', desc: 'Poulpe croustillant avec crème de pommes de terre, persil et huile au citron.' },
      vec: { name: 'Folpo ai ferri', desc: 'Folpo crocante co crema de patate, persemolo e ojo al limon.' },
    },
  },
  {
    id: 'demo-entry-burrata',
    categoryId: 'demo-cat-starters',
    name: 'Burrata, cherry tomatoes and pesto',
    description: 'Apulian burrata with sweet cherry tomatoes, light pesto and crisp focaccia.',
    price: 1200,
    imageUrl: '/demo-images/burrata.jpg',
    sortOrder: 3,
    allergens: ['Latte-e-Derivati', 'Glutine', 'Frutta-a-Guscio'],
    i18n: {
      it: { name: 'Burrata, datterini e pesto', desc: 'Burrata pugliese con pomodorini dolci, pesto leggero e focaccia croccante.' },
      en: { name: 'Burrata, cherry tomatoes and pesto', desc: 'Apulian burrata with sweet cherry tomatoes, light pesto and crisp focaccia.' },
      de: { name: 'Burrata, Datteltomaten und Pesto', desc: 'Burrata aus Apulien mit süßen Kirschtomaten, leichtem Pesto und knuspriger Focaccia.' },
      fr: { name: 'Burrata, tomates cerises et pesto', desc: 'Burrata des Pouilles avec tomates cerises douces, pesto léger et focaccia croustillante.' },
      vec: { name: 'Burrata, datterini e pesto', desc: 'Burrata pugliese co pomodorini dolsi, pesto liziero e focaccia crocante.' },
    },
  },
  {
    id: 'demo-entry-ravioli',
    categoryId: 'demo-cat-pasta',
    name: 'Ricotta and spinach ravioli',
    description: 'Homemade ravioli with butter and sage.',
    price: 1450,
    imageUrl: '/demo-images/ravioli.jpg',
    sortOrder: 0,
    allergens: ['Glutine', 'Uova', 'Latte-e-Derivati'],
    i18n: {
      it: { name: 'Ravioli ricotta e spinaci', desc: 'Ravioli fatti in casa con burro e salvia.' },
      en: { name: 'Ricotta and spinach ravioli', desc: 'Homemade ravioli with butter and sage.' },
      de: { name: 'Ravioli mit Ricotta und Spinat', desc: 'Hausgemachte Ravioli mit Butter und Salbei.' },
      fr: { name: 'Ravioli ricotta-épinards', desc: 'Ravioli maison au beurre et à la sauge.' },
      vec: { name: 'Ravioli ricota e spinasi', desc: 'Ravioli fati in casa co buro e salvia.' },
    },
  },
  {
    id: 'demo-entry-spaghetti',
    categoryId: 'demo-cat-pasta',
    name: 'Spaghetti with clams',
    description: 'Spaghetti with clams, garlic, parsley and white wine.',
    price: 1650,
    imageUrl: '/demo-images/spaghetti.jpg',
    sortOrder: 1,
    allergens: ['Glutine', 'Molluschi', 'Anidride-Solforosa-e-Solfiti'],
    i18n: {
      it: { name: 'Spaghetti alle vongole', desc: 'Spaghetti con vongole, aglio, prezzemolo e vino bianco.' },
      en: { name: 'Spaghetti with clams', desc: 'Spaghetti with clams, garlic, parsley and white wine.' },
      de: { name: 'Spaghetti mit Venusmuscheln', desc: 'Spaghetti mit Muscheln, Knoblauch, Petersilie und Weißwein.' },
      fr: { name: 'Spaghetti aux palourdes', desc: 'Spaghetti aux palourdes, ail, persil et vin blanc.' },
      vec: { name: 'Spaghetti co le vongole', desc: 'Spaghetti co vongole, ajo, persemolo e vin bianco.' },
    },
  },
  {
    id: 'demo-entry-branzino',
    categoryId: 'demo-cat-mains',
    name: 'Sea bass fillet',
    description: 'Baked sea bass with seasonal vegetables, lemon and thyme.',
    price: 2150,
    imageUrl: '/demo-images/branzino.jpg',
    sortOrder: 0,
    allergens: ['Pesce'],
    i18n: {
      it: { name: 'Filetto di branzino', desc: 'Branzino al forno con verdure di stagione, limone e timo.' },
      en: { name: 'Sea bass fillet', desc: 'Baked sea bass with seasonal vegetables, lemon and thyme.' },
      de: { name: 'Wolfsbarschfilet', desc: 'Gebackener Wolfsbarsch mit Saisongemüse, Zitrone und Thymian.' },
      fr: { name: 'Filet de bar', desc: 'Bar au four avec légumes de saison, citron et thym.' },
      vec: { name: 'Fileto de branzin', desc: 'Branzin al forno co verdure de stagion, limon e timo.' },
    },
  },
  {
    id: 'demo-entry-tagliata',
    categoryId: 'demo-cat-mains',
    name: 'Sliced beef tagliata',
    description: 'Seared beef with arugula, parmesan flakes and balsamic reduction.',
    price: 2400,
    imageUrl: '/demo-images/tagliata.jpg',
    sortOrder: 1,
    allergens: ['Latte-e-Derivati'],
    i18n: {
      it: { name: 'Tagliata di manzo', desc: 'Manzo scottato, rucola, scaglie di grana e riduzione al balsamico.' },
      en: { name: 'Sliced beef tagliata', desc: 'Seared beef with arugula, parmesan flakes and balsamic reduction.' },
      de: { name: 'Rindertagliata', desc: 'Kurz gebratenes Rindfleisch mit Rucola, Parmesan und Balsamico-Reduktion.' },
      fr: { name: 'Tagliata de bœuf', desc: 'Bœuf saisi, roquette, copeaux de parmesan et réduction balsamique.' },
      vec: { name: 'Taiata de manzo', desc: 'Manzo scotà, rucola, scaie de grana e ridusion al balsamico.' },
    },
  },
  {
    id: 'demo-entry-tiramisu',
    categoryId: 'demo-cat-desserts',
    name: 'House tiramisu',
    description: 'Mascarpone, coffee and cocoa.',
    price: 650,
    imageUrl: '/demo-images/tiramisu.jpg',
    sortOrder: 0,
    allergens: ['Uova', 'Latte-e-Derivati', 'Glutine'],
    i18n: {
      it: { name: 'Tiramisù della casa', desc: 'Mascarpone, caffè e cacao.' },
      en: { name: 'House tiramisu', desc: 'Mascarpone, coffee and cocoa.' },
      de: { name: 'Hausgemachtes Tiramisù', desc: 'Mascarpone, Kaffee und Kakao.' },
      fr: { name: 'Tiramisu maison', desc: 'Mascarpone, café et cacao.' },
      vec: { name: 'Tiramisù de casa', desc: 'Mascarpone, cafè e cacao.' },
    },
  },
  {
    id: 'demo-entry-prosecco',
    categoryId: 'demo-cat-wines',
    name: 'Prosecco Brut',
    description: 'A fresh and floral glass of prosecco.',
    price: 550,
    imageUrl: '/demo-images/prosecco.jpg',
    sortOrder: 0,
    allergens: ['Anidride-Solforosa-e-Solfiti'],
    i18n: {
      it: { name: 'Prosecco Brut', desc: 'Calice di prosecco fresco e floreale.' },
      en: { name: 'Prosecco Brut', desc: 'A fresh and floral glass of prosecco.' },
      de: { name: 'Prosecco Brut', desc: 'Ein frisches, blumiges Glas Prosecco.' },
      fr: { name: 'Prosecco Brut', desc: 'Un verre de prosecco frais et floral.' },
      vec: { name: 'Prosecco Brut', desc: 'Un calice de prosecco fresco e fiorìo.' },
    },
  },
];

const variants = [
  { id: 'demo-variant-pasta-size', name: 'Portion', description: 'Choose the size', sortOrder: 0, selections: [{ id: 'regular', name: 'Regular', price: 0, i18n: { it: { name: 'Normale' } } }, { id: 'large', name: 'Large', price: 300, i18n: { it: { name: 'Abbondante' } } }], i18n: { it: { name: 'Porzione', desc: 'Scegli la dimensione' } } },
];

const extras = [
  { id: 'demo-extra-bread', name: 'Extra bread', type: 'zeroorone', max: 1, options: [{ id: 'bread', name: 'Extra bread', price: 150, i18n: { it: { name: 'Pane extra' } } }], i18n: { it: { name: 'Pane extra' } } },
];

export async function resetDemoData(env: Env): Promise<void> {
  if (!env.DB) throw new Error('Database not configured');

  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM catalog_views'),
    env.DB.prepare('DELETE FROM chat_sessions'),
    env.DB.prepare('DELETE FROM audit_events'),
    env.DB.prepare('DELETE FROM entry_labels'),
    env.DB.prepare('DELETE FROM labels'),
    env.DB.prepare('DELETE FROM menu_entry_memberships'),
    env.DB.prepare('DELETE FROM menu_entries'),
    env.DB.prepare('DELETE FROM menu_categories'),
    env.DB.prepare('DELETE FROM menus'),
    env.DB.prepare('DELETE FROM menu_variants'),
    env.DB.prepare('DELETE FROM menu_extras'),
    env.DB.prepare(`UPDATE settings SET name = ?, payoff = ?, theme = ?, info = ?, socials = ?, opening_schedule = ?, promotion_alert = ?, chat_agent_prompt = ?, ai_chat_enabled = ?, ai_voice_enabled = ?, primary_locale = ?, enabled_locales = ?, disabled_locales = ?, custom_locales = ?, publication_state = ?, updated_at = ? WHERE id = 1`).bind(
      settings.name,
      settings.payoff,
      JSON.stringify(settings.theme),
      JSON.stringify(settings.info),
      JSON.stringify(settings.socials),
      JSON.stringify(settings.openingSchedule),
      JSON.stringify(settings.promotionAlert),
      settings.chatAgentPrompt,
      settings.aiChatEnabled ? 1 : 0,
      settings.aiVoiceEnabled ? 1 : 0,
      settings.primaryLocale,
      JSON.stringify(settings.enabledLocales),
      JSON.stringify(settings.disabledLocales),
      JSON.stringify(settings.customLocales),
      settings.publicationState,
      Date.now(),
    ),
  ];

  for (const menu of menus) {
    statements.push(env.DB.prepare('INSERT INTO menus (id, code, title, i18n, published, sort_order, icon, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)').bind(menu.id, menu.code, menu.title, JSON.stringify(menu.i18n), menu.sortOrder, menu.icon, now, now));
  }
  for (const category of categories) {
    statements.push(env.DB.prepare('INSERT INTO menu_categories (id, name, sort_order, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(category.id, category.name, category.sortOrder, JSON.stringify(category.i18n), now, now));
  }
  for (const entry of entries) {
    statements.push(env.DB.prepare('INSERT INTO menu_entries (id, category_id, name, description, price, image_url, sort_order, hidden, allergens, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').bind(entry.id, entry.categoryId, entry.name, entry.description, entry.price, entry.imageUrl, entry.sortOrder, JSON.stringify(entry.allergens), JSON.stringify(entry.i18n), now, now));
    const menuId = drinkCategoryIds.has(entry.categoryId) ? DRINKS_MENU_ID : FOOD_MENU_ID;
    statements.push(env.DB.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').bind(menuId, entry.id));
  }
  for (const variant of variants) {
    statements.push(env.DB.prepare('INSERT INTO menu_variants (id, name, description, sort_order, selections, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(variant.id, variant.name, variant.description, variant.sortOrder, JSON.stringify(variant.selections), JSON.stringify(variant.i18n), now, now));
  }
  for (const extra of extras) {
    statements.push(env.DB.prepare('INSERT INTO menu_extras (id, name, type, max, options, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(extra.id, extra.name, extra.type, extra.max, JSON.stringify(extra.options), JSON.stringify(extra.i18n), now, now));
  }

  const demoLabels = [
    {
      id: 'demo-label-chef',
      name: "Lo Chef consiglia",
      color: 'red',
      sortOrder: 0,
      i18n: { en: { name: "Chef's pick" }, it: { name: 'Lo Chef consiglia' }, de: { name: 'Chef empfiehlt' }, fr: { name: 'Le Chef recommande' } },
      entryIds: ['demo-entry-polpo', 'demo-entry-tagliata'],
    },
    {
      id: 'demo-label-veg',
      name: 'Vegetariano',
      color: 'green',
      sortOrder: 1,
      i18n: { en: { name: 'Vegetarian' }, it: { name: 'Vegetariano' }, de: { name: 'Vegetarisch' }, fr: { name: 'Végétarien' } },
      entryIds: ['demo-entry-carpaccio', 'demo-entry-ravioli'],
    },
  ];
  for (const label of demoLabels) {
    statements.push(env.DB.prepare('INSERT INTO labels (id, name, color, sort_order, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(label.id, label.name, label.color, label.sortOrder, JSON.stringify(label.i18n), now, now));
    for (const entryId of label.entryIds) {
      statements.push(env.DB.prepare('INSERT INTO entry_labels (entry_id, label_id) VALUES (?, ?)').bind(entryId, label.id));
    }
  }

  await env.DB.batch(statements);
  await deleteR2Prefix(env.PUBLIC_MENU_BUCKET, 'images/');
}

async function deleteR2Prefix(bucket: R2Bucket | undefined, prefix: string): Promise<void> {
  if (!bucket) return;

  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
