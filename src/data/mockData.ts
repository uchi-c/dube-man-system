import { User, Product, Customer, PrintingOrder, Computer, CafeSession, ActivityLog, WifiSessionRecord, WifiCustomer, WifiPackage, WifiSession, WifiUsageLog, RouterSetting } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'u-1',
    name: 'Dube Man (Owner)',
    email: 'admin@dubeman.com',
    role: 'ADMIN',
    created_at: new Date('2026-01-10').toISOString()
  },
  {
    id: 'u-2',
    name: 'Sarah Phiri (Operator)',
    email: 'staff@dubeman.com',
    role: 'STAFF',
    created_at: new Date('2026-02-15').toISOString()
  },
  {
    id: 'u-3',
    name: 'John Banda (Desk Operator)',
    email: 'cafe@dubeman.com',
    role: 'CAFE_OPERATOR',
    created_at: new Date('2026-03-01').toISOString()
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    name: 'A4 Printing Paper (Ream - 500 sheets)',
    category: 'Stationery',
    quantity: 45,
    buying_price: 35.00,
    selling_price: 55.00,
    supplier: 'Paper Corp Distributors',
    min_stock_level: 10,
    created_at: new Date('2026-04-01').toISOString(),
    updated_at: new Date('2026-04-01').toISOString()
  },
  {
    id: 'p-2',
    name: 'Black Ballpoint Pens (Box of 50)',
    category: 'Stationery',
    quantity: 8, // Low Stock Warning!
    buying_price: 15.00,
    selling_price: 25.00,
    supplier: 'Global Stationery Wholesalers',
    min_stock_level: 10,
    created_at: new Date('2026-04-02').toISOString(),
    updated_at: new Date('2026-04-02').toISOString()
  },
  {
    id: 'p-3',
    name: 'Branded Polo Shirt Embroidery (Custom)',
    category: 'Embroidery',
    quantity: 120,
    buying_price: 60.00,
    selling_price: 120.00,
    supplier: 'Textile Hub Ltd',
    min_stock_level: 15,
    created_at: new Date('2026-04-03').toISOString(),
    updated_at: new Date('2026-04-03').toISOString()
  },
  {
    id: 'p-4',
    name: 'Heavy Duty Binding Combs (100 pack)',
    category: 'Printing',
    quantity: 5, // Low Stock Warning!
    buying_price: 40.00,
    selling_price: 75.00,
    supplier: 'Office Depot Solutions',
    min_stock_level: 8,
    created_at: new Date('2026-04-04').toISOString(),
    updated_at: new Date('2026-04-04').toISOString()
  },
  {
    id: 'p-5',
    name: 'Glossy Photo Paper (A4 Pack of 50)',
    category: 'Printing',
    quantity: 22,
    buying_price: 50.00,
    selling_price: 90.00,
    supplier: 'Paper Corp Distributors',
    min_stock_level: 5,
    created_at: new Date('2026-04-05').toISOString(),
    updated_at: new Date('2026-04-05').toISOString()
  },
  {
    id: 'p-6',
    name: 'Digital Scanning & Email (Per Document)',
    category: 'Digital',
    quantity: 1000, // Virtually infinite, but tracks transactions
    buying_price: 0.00,
    selling_price: 5.00,
    supplier: 'Self-produced',
    min_stock_level: -1,
    created_at: new Date('2026-04-05').toISOString(),
    updated_at: new Date('2026-04-05').toISOString()
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'c-1',
    name: 'Chisomo Kalua',
    phone: '+265 888 12 34 56',
    email: 'chisomo@gmail.com',
    created_at: new Date('2026-05-10').toISOString()
  },
  {
    id: 'c-2',
    name: 'Mphatso Phiri',
    phone: '+265 999 45 61 23',
    email: 'mphatso@yahoo.com',
    created_at: new Date('2026-05-12').toISOString()
  },
  {
    id: 'c-3',
    name: 'Tiwonge Gondwe',
    phone: '+265 882 11 22 33',
    email: 'tiwonge.g@hotmail.com',
    created_at: new Date('2026-05-14').toISOString()
  },
  {
    id: 'c-4',
    name: 'Limbe Primary School',
    phone: '+265 111 88 77 66',
    email: 'info@limbe-school.edu',
    created_at: new Date('2026-05-18').toISOString()
  }
];

export const INITIAL_PRINTING_ORDERS: PrintingOrder[] = [
  {
    id: 'po-1',
    customer_id: 'c-1',
    customer_name: 'Chisomo Kalua',
    customer_phone: '+265 888 12 34 56',
    description: '30x Wedding Invitation Cards - Embossed Glossy Finish',
    quantity: 30,
    amount: 1500.00,
    amount_paid: 1000.00, // Balance: 500
    status: 'Designing',
    created_by: 'u-2',
    created_at: new Date('2026-06-21T10:00:00Z').toISOString()
  },
  {
    id: 'po-2',
    customer_id: 'c-2',
    customer_name: 'Mphatso Phiri',
    customer_phone: '+265 999 45 61 23',
    description: '15x Branded Polo Shirts with Dube General Dealers Logo Embroidery',
    quantity: 15,
    amount: 1800.00,
    amount_paid: 1800.00, // Balance: 0
    status: 'Printing',
    created_by: 'u-2',
    created_at: new Date('2026-06-22T08:30:00Z').toISOString()
  },
  {
    id: 'po-3',
    customer_id: 'c-4',
    customer_name: 'Limbe Primary School',
    customer_phone: '+265 111 88 77 66',
    description: '500x End of Term Academic Reports (B&W Double Sided, Stapled)',
    quantity: 500,
    amount: 2500.00,
    amount_paid: 1250.00, // Balance: 1250
    status: 'Pending',
    created_by: 'u-2',
    created_at: new Date('2026-06-22T14:45:00Z').toISOString()
  },
  {
    id: 'po-4',
    customer_id: 'c-3',
    customer_name: 'Tiwonge Gondwe',
    customer_phone: '+265 882 11 22 33',
    description: '10x A3 Business Showcase Posters Laminating & Printing',
    quantity: 10,
    amount: 400.00,
    amount_paid: 400.00,
    status: 'Completed',
    created_by: 'u-2',
    created_at: new Date('2026-06-20T09:00:00Z').toISOString()
  },
  {
    id: 'po-5',
    customer_id: 'c-1',
    customer_name: 'Chisomo Kalua',
    customer_phone: '+265 888 12 34 56',
    description: 'Personal CV Digital Copy & Professional Typing (3 pages)',
    quantity: 3,
    amount: 150.00,
    amount_paid: 150.00,
    status: 'Collected',
    created_by: 'u-2',
    created_at: new Date('2026-06-19T11:20:00Z').toISOString()
  }
];

export const INITIAL_COMPUTERS: Computer[] = [
  {
    id: 'comp-1',
    computer_name: 'Station PC-01',
    computer_code: 'PC-01',
    status: 'Occupied',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date().toISOString()
  },
  {
    id: 'comp-2',
    computer_name: 'Station PC-02',
    computer_code: 'PC-02',
    status: 'Available',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date().toISOString()
  },
  {
    id: 'comp-3',
    computer_name: 'Station PC-03',
    computer_code: 'PC-03',
    status: 'Maintenance',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'comp-4',
    computer_name: 'Station PC-04',
    computer_code: 'PC-04',
    status: 'Occupied',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date().toISOString()
  },
  {
    id: 'comp-5',
    computer_name: 'Station PC-05',
    computer_code: 'PC-05',
    status: 'Available',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date().toISOString()
  },
  {
    id: 'comp-6',
    computer_name: 'Station PC-06',
    computer_code: 'PC-06',
    status: 'Available',
    hourly_rate: 60.00,
    rate_per_minute: 1.00,
    last_seen: new Date().toISOString()
  }
];

export const INITIAL_SESSIONS: CafeSession[] = [
  {
    id: 'sess-1',
    computer_id: 'comp-1',
    computer_name: 'Station PC-01',
    customer_name: 'Alex Phiri',
    start_time: new Date(Date.now() - 3600000 * 1.5).toISOString(), // 1.5 hours ago
    rate_per_minute: 1.00,
    status: 'ACTIVE'
  },
  {
    id: 'sess-4',
    computer_id: 'comp-4',
    computer_name: 'Station PC-04',
    customer_name: 'Mary Banda',
    start_time: new Date(Date.now() - 1800000 * 1).toISOString(), // 30 mins ago
    rate_per_minute: 1.00,
    status: 'ACTIVE'
  }
];

export const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 'log-1',
    user_id: 'u-1',
    user_name: 'Dube Man (Owner)',
    action: 'System initialized. Pre-loaded products and computers database.',
    timestamp: new Date('2026-06-20T08:00:00Z').toISOString()
  },
  {
    id: 'log-2',
    user_id: 'u-2',
    user_name: 'Sarah Phiri (Operator)',
    action: 'Created Printing Order po-1 for Chisomo Kalua: 30x Invitation Cards.',
    timestamp: new Date('2026-06-21T10:05:00Z').toISOString()
  },
  {
    id: 'log-3',
    user_id: 'u-2',
    user_name: 'Sarah Phiri (Operator)',
    action: 'Stock replenishment: Paper Corp reams increased (+20 reams).',
    timestamp: new Date('2026-06-21T12:00:00Z').toISOString()
  },
  {
    id: 'log-4',
    user_id: 'u-3',
    user_name: 'John Banda (Desk Operator)',
    action: 'Ended internet session for customer TIWONGE on Station PC-02 (45 mins used, Charged 15.00).',
    timestamp: new Date('2026-06-22T09:15:00Z').toISOString()
  }
];

export const INITIAL_WIFI: WifiSessionRecord[] = [
  {
    id: 'wifi-1',
    customer_name: 'Chikondi Chuma',
    device_name: 'Tecno-Spark-10',
    access_duration_minutes: 60,
    bandwidth_used_mb: 245.50,
    created_at: new Date('2026-06-22T10:30:00Z').toISOString()
  },
  {
    id: 'wifi-2',
    customer_name: 'Mercy Tembo',
    device_name: 'iPhone-12-Pro',
    access_duration_minutes: 120,
    bandwidth_used_mb: 512.10,
    created_at: new Date('2026-06-22T11:45:00Z').toISOString()
  },
  {
    id: 'wifi-3',
    customer_name: 'George Kumwenda',
    device_name: 'MacBookAir-M1',
    access_duration_minutes: 180,
    bandwidth_used_mb: 1205.80,
    created_at: new Date('2026-06-22T13:00:00Z').toISOString()
  }
];

export const INITIAL_WIFI_CUSTOMERS: WifiCustomer[] = [
  {
    id: 'wc-1',
    name: 'Mercy Tembo',
    phone: '0998765432',
    device_name: 'iPhone-12-Pro',
    mac_address: '00:1A:2B:3C:4D:5E',
    created_at: new Date('2026-06-23T10:00:00Z').toISOString()
  },
  {
    id: 'wc-2',
    name: 'Chikondi Chuma',
    phone: '0887654321',
    device_name: 'Tecno-Spark-10',
    mac_address: '11:22:33:44:55:66',
    created_at: new Date('2026-06-23T11:00:00Z').toISOString()
  },
  {
    id: 'wc-3',
    name: 'George Kumwenda',
    phone: '0991234567',
    device_name: 'MacBookAir-M1',
    mac_address: 'AA:BB:CC:DD:EE:FF',
    created_at: new Date('2026-06-23T12:00:00Z').toISOString()
  }
];

export const INITIAL_WIFI_PACKAGES: WifiPackage[] = [
  {
    id: 'wp-1',
    name: '30 Minutes Spark',
    duration_minutes: 30,
    price: 350.00,
    created_at: new Date('2026-06-23T08:00:00Z').toISOString()
  },
  {
    id: 'wp-2',
    name: '60 Minutes Pro',
    duration_minutes: 60,
    price: 600.00,
    created_at: new Date('2026-06-23T08:00:00Z').toISOString()
  },
  {
    id: 'wp-3',
    name: '120 Minutes Extreme',
    duration_minutes: 120,
    price: 1100.00,
    created_at: new Date('2026-06-23T08:00:00Z').toISOString()
  },
  {
    id: 'wp-4',
    name: '240 Minutes Enterprise',
    duration_minutes: 240,
    price: 2000.00,
    created_at: new Date('2026-06-23T08:00:00Z').toISOString()
  }
];

export const INITIAL_WIFI_SESSIONS: WifiSession[] = [
  {
    id: 'ws-1',
    customer_id: 'wc-1',
    package_id: 'wp-2',
    start_time: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
    end_time: new Date(Date.now() + 45 * 60 * 1000).toISOString(),   // 45 mins from now
    duration_minutes: 60,
    amount: 600.00,
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  },
  {
    id: 'ws-2',
    customer_id: 'wc-2',
    package_id: 'wp-1',
    start_time: new Date(Date.now() - 40 * 60 * 1000).toISOString(), // 40 mins ago -> expired
    end_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),   // 10 mins ago -> expired
    duration_minutes: 30,
    amount: 350.00,
    status: 'EXPIRED',
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString()
  },
  {
    id: 'ws-3',
    customer_id: 'wc-3',
    package_id: 'wp-3',
    start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
    end_time: new Date(Date.now() + 115 * 60 * 1000).toISOString(),  // 115 mins from now
    duration_minutes: 120,
    amount: 1100.00,
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
  }
];

export const INITIAL_WIFI_LOGS: WifiUsageLog[] = [
  {
    id: 'wl-1',
    customer_id: 'wc-1',
    device_name: 'iPhone-12-Pro',
    mac_address: '00:1A:2B:3C:4D:5E',
    action: 'CONNECTED',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  },
  {
    id: 'wl-2',
    customer_id: 'wc-2',
    device_name: 'Tecno-Spark-10',
    mac_address: '11:22:33:44:55:66',
    action: 'CONNECTED',
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString()
  },
  {
    id: 'wl-3',
    customer_id: 'wc-2',
    device_name: 'Tecno-Spark-10',
    mac_address: '11:22:33:44:55:66',
    action: 'EXPIRED',
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  },
  {
    id: 'wl-4',
    customer_id: 'wc-3',
    device_name: 'MacBookAir-M1',
    mac_address: 'AA:BB:CC:DD:EE:FF',
    action: 'CONNECTED',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
  }
];

export const INITIAL_ROUTER_SETTINGS: RouterSetting[] = [
  {
    id: 'r-1',
    router_name: 'Dube Man Mikrotik Core',
    router_brand: 'Mikrotik',
    router_model: 'hEX S (RB760iGS)',
    integration_type: 'REST_API',
    created_at: new Date('2026-06-23T08:00:00Z').toISOString()
  }
];

