/**
 * Local Storage database helper and transactions simulator
 * Simulates Supabase Client APIs and executes transactional updates
 */

import { 
  User, Product, InventoryTransaction, Sale, 
  Customer, PrintingOrder, Computer, CafeSession, 
  ActivityLog, WifiSessionRecord, UserRole, PrintingStatus,
  CafeSessionStatus, WifiCustomer, WifiPackage, WifiSession,
  WifiUsageLog, RouterSetting
} from '../types';

import { 
  INITIAL_USERS, INITIAL_PRODUCTS, INITIAL_CUSTOMERS, 
  INITIAL_PRINTING_ORDERS, INITIAL_COMPUTERS, INITIAL_SESSIONS, 
  INITIAL_LOGS, INITIAL_WIFI,
  INITIAL_WIFI_CUSTOMERS, INITIAL_WIFI_PACKAGES, INITIAL_WIFI_SESSIONS,
  INITIAL_WIFI_LOGS, INITIAL_ROUTER_SETTINGS
} from '../data/mockData';

// Helper to access LocalStorage with fallback seeds
const getStorageItem = <T>(key: string, initial: T): T => {
  const item = localStorage.getItem(`dubeman_${key}`);
  if (!item) {
    localStorage.setItem(`dubeman_${key}`, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(item) as T;
  } catch {
    return initial;
  }
};

const setStorageItem = <T>(key: string, data: T): void => {
  localStorage.setItem(`dubeman_${key}`, JSON.stringify(data));
};

// --- INITIALIZE SYSTEM STORE ---
export const initializeStore = (): void => {
  getStorageItem('users', INITIAL_USERS);
  getStorageItem('products', INITIAL_PRODUCTS);
  getStorageItem('customers', INITIAL_CUSTOMERS);
  getStorageItem('printing_orders', INITIAL_PRINTING_ORDERS);
  getStorageItem('computers', INITIAL_COMPUTERS);
  getStorageItem('sessions', INITIAL_SESSIONS);
  getStorageItem('logs', INITIAL_LOGS);
  getStorageItem('wifi', INITIAL_WIFI);
  getStorageItem('wifi_customers', INITIAL_WIFI_CUSTOMERS);
  getStorageItem('wifi_packages', INITIAL_WIFI_PACKAGES);
  getStorageItem('wifi_sessions', INITIAL_WIFI_SESSIONS);
  getStorageItem('wifi_usage_logs', INITIAL_WIFI_LOGS);
  getStorageItem('router_settings', INITIAL_ROUTER_SETTINGS);
};

// --- AUTH / USER FUNCTIONS ---
export const getCurrentUser = (): User => {
  const item = localStorage.getItem('dubeman_current_user');
  if (!item) {
    return INITIAL_USERS[0];
  }
  try {
    return JSON.parse(item) as User;
  } catch {
    return INITIAL_USERS[0];
  }
};

export const setCurrentUser = (user: User): void => {
  setStorageItem('current_user', user);
  addLog(user.id, user.name, `User authenticated as role: ${user.role}`);
};

export const getAllUsers = (): User[] => {
  return getStorageItem<User[]>('users', INITIAL_USERS);
};

// --- PRODUCT FUNCTIONS ---
export const getProducts = (): Product[] => {
  return getStorageItem<Product[]>('products', INITIAL_PRODUCTS);
};

export const saveProduct = (product: Product): void => {
  const products = getProducts();
  const index = products.findIndex(p => p.id === product.id);
  const currentUser = getCurrentUser();

  if (index >= 0) {
    products[index] = { ...product, updated_at: new Date().toISOString() };
    addLog(currentUser.id, currentUser.name, `Updated product attributes for ID: ${product.id} (${product.name})`);
  } else {
    products.push({
      ...product,
      id: `p-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    addLog(currentUser.id, currentUser.name, `Created new catalog product: ${product.name}`);
  }
  setStorageItem('products', products);
};

// Stock In / Stock Out
export const modifyProductStock = (
  productId: string, 
  delta: number, 
  type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT'
): boolean => {
  const products = getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return false;

  const currentStock = product.quantity;
  // If stock out, verify sufficient balance
  if (type === 'STOCK_OUT' && currentStock < delta) {
    return false;
  }

  const finalQuantity = type === 'STOCK_IN' ? currentStock + delta : currentStock - delta;
  
  product.quantity = finalQuantity;
  product.updated_at = new Date().toISOString();
  
  setStorageItem('products', products);

  // Add transaction log
  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Stock ${type === 'STOCK_IN' ? 'Replenishment' : 'Deduction'} for ${product.name}: ${delta} pieces. New stock: ${finalQuantity}`);
  
  return true;
};

// --- CUSTOMERS FUNCTIONS ---
export const getCustomers = (): Customer[] => {
  return getStorageItem<Customer[]>('customers', INITIAL_CUSTOMERS);
};

export const addCustomer = (name: string, phone: string, email: string): Customer => {
  const customers = getCustomers();
  const newCust: Customer = {
    id: `c-${Date.now()}`,
    name,
    phone,
    email,
    created_at: new Date().toISOString()
  };
  customers.push(newCust);
  setStorageItem('customers', customers);

  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Registered new client profile: ${name}`);
  return newCust;
};

// --- SALES FUNCTIONS ---
export const getSales = (): Sale[] => {
  return getStorageItem<Sale[]>('sales', []);
};

export const createSale = (
  customerId: string | null, 
  items: { product_id: string; quantity: number; unit_price: number }[],
  paymentMethod: 'Cash' | 'Mobile Money' | 'Bank'
): Sale | string => {
  const products = getProducts();
  const sales = getSales();
  const currentUser = getCurrentUser();
  const customers = getCustomers();

  // Validate stock levels first
  for (const item of items) {
    const prod = products.find(p => p.id === item.product_id);
    if (!prod) return `product ${item.product_id} not found`;
    if (prod.quantity < item.quantity) {
      return `Insufficient stock for: ${prod.name}. Available: ${prod.quantity}`;
    }
  }

  // Calculate total amount
  let totalAmount = 0;
  const saleItems: any[] = [];

  // Deduct stock and commit changes
  items.forEach(item => {
    const prod = products.find(p => p.id === item.product_id)!;
    prod.quantity = prod.quantity - item.quantity;
    prod.updated_at = new Date().toISOString();
    
    totalAmount += item.quantity * item.unit_price;
    saleItems.push({
      id: `si-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      product_id: item.product_id,
      product_name: prod.name,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
  });

  const targetCustomer = customerId ? customers.find(c => c.id === customerId) : null;

  const newSale: Sale = {
    id: `sale-${Date.now()}`,
    customer_id: customerId,
    customer_name: targetCustomer ? targetCustomer.name : 'Walk-in Customer',
    total_amount: totalAmount,
    payment_method: paymentMethod,
    created_by: currentUser.id,
    created_at: new Date().toISOString(),
    items: saleItems
  };

  sales.push(newSale);
  
  // Save tables
  setStorageItem('products', products);
  setStorageItem('sales', sales);

  addLog(currentUser.id, currentUser.name, `POS Sale Completed (Total amount: ${totalAmount.toFixed(2)}, Payment: ${paymentMethod})`);

  return newSale;
};

// --- PRINTING ORDERS ---
export const getPrintingOrders = (): PrintingOrder[] => {
  return getStorageItem<PrintingOrder[]>('printing_orders', INITIAL_PRINTING_ORDERS);
};

export const addPrintingOrder = (
  customerId: string,
  description: string,
  quantity: number,
  amount: number,
  amountPaid: number
): PrintingOrder => {
  const orders = getPrintingOrders();
  const customers = getCustomers();
  const customer = customers.find(c => c.id === customerId)!;
  const currentUser = getCurrentUser();

  const newOrder: PrintingOrder = {
    id: `po-${Date.now()}`,
    customer_id: customerId,
    customer_name: customer ? customer.name : 'Unknown Customer',
    customer_phone: customer ? customer.phone : '',
    description,
    quantity,
    amount,
    amount_paid: amountPaid,
    status: 'Pending',
    created_by: currentUser.id,
    created_at: new Date().toISOString()
  };

  orders.push(newOrder);
  setStorageItem('printing_orders', orders);

  addLog(currentUser.id, currentUser.name, `Logged new Printing Order for ${newOrder.customer_name}: ${description}`);
  return newOrder;
};

export const updatePrintingOrderStatus = (orderId: string, status: PrintingStatus): void => {
  const orders = getPrintingOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index >= 0) {
    const oldStatus = orders[index].status;
    orders[index].status = status;
    setStorageItem('printing_orders', orders);

    const currentUser = getCurrentUser();
    addLog(currentUser.id, currentUser.name, `Advanced Printing Order (${orders[index].id}) status from ${oldStatus} to ${status}`);
  }
};

export const updatePrintingOrderPayment = (orderId: string, addedAmountPaid: number): void => {
  const orders = getPrintingOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index >= 0) {
    const order = orders[index];
    const newPaid = order.amount_paid + addedAmountPaid;
    order.amount_paid = Math.min(order.amount, newPaid);
    setStorageItem('printing_orders', orders);

    const currentUser = getCurrentUser();
    addLog(currentUser.id, currentUser.name, `Recorded additional payment of ${addedAmountPaid} for Printing Order (${order.id}). Customer now paid ${order.amount_paid}/${order.amount}`);
  }
};

// --- INTERNET CAFE FUNCTIONS ---
export const getComputers = (): Computer[] => {
  return getStorageItem<Computer[]>('computers', INITIAL_COMPUTERS);
};

export const setComputerMaintenance = (compId: string, inMaintenance: boolean): void => {
  const computers = getComputers();
  const index = computers.findIndex(c => c.id === compId);
  if (index >= 0) {
    const newStatus = inMaintenance ? 'Maintenance' : 'Available';
    computers[index].status = newStatus;
    setStorageItem('computers', computers);

    const currentUser = getCurrentUser();
    addLog(currentUser.id, currentUser.name, `Changed ${computers[index].computer_name} mode to ${newStatus}`);
  }
};

export const getRunningSessions = (): CafeSession[] => {
  const sessions = getStorageItem<CafeSession[]>('sessions', INITIAL_SESSIONS);
  return sessions.map(s => {
    // Map older status 'Running' to 'ACTIVE'
    const status: CafeSessionStatus = s.status === ('Running' as any) ? 'ACTIVE' : s.status;
    return {
      ...s,
      status,
      rate_per_minute: s.rate_per_minute || 1.00
    };
  });
};

export const getPastSessions = (): CafeSession[] => {
  const sessions = getStorageItem<CafeSession[]>('past_sessions', []);
  return sessions.map(s => {
    // Map older status 'Completed' to 'COMPLETED'
    const status: CafeSessionStatus = s.status === ('Completed' as any) ? 'COMPLETED' : s.status;
    return {
      ...s,
      status,
      rate_per_minute: s.rate_per_minute || 1.00
    };
  });
};

export const startCafeSession = (computerId: string, customerName: string): boolean => {
  const computers = getComputers();
  const compIndex = computers.findIndex(c => c.id === computerId);
  if (compIndex === -1 || computers[compIndex].status !== 'Available') return false;

  const sessions = getRunningSessions();
  const targetComp = computers[compIndex];

  targetComp.status = 'Occupied';
  targetComp.last_seen = new Date().toISOString();

  const newSession: CafeSession = {
    id: `sess-${Date.now()}`,
    computer_id: computerId,
    computer_name: targetComp.computer_name,
    customer_name: customerName,
    start_time: new Date().toISOString(),
    rate_per_minute: targetComp.rate_per_minute || 1.00,
    status: 'ACTIVE'
  };

  sessions.push(newSession);
  
  setStorageItem('computers', computers);
  setStorageItem('sessions', sessions);

  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Started Internet Session on ${targetComp.computer_name} for customer: ${customerName}`);
  return true;
};

export const terminateCafeSession = (sessionId: string): CafeSession | null => {
  const sessions = getRunningSessions();
  const sessIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessIndex === -1) return null;

  const session = sessions[sessIndex];
  const computers = getComputers();
  const compIndex = computers.findIndex(c => c.id === session.computer_id);

  // Set computer back to available
  if (compIndex >= 0) {
    computers[compIndex].status = 'Available';
    computers[compIndex].last_seen = new Date().toISOString();
  }

  // Calculate times
  const startTime = new Date(session.start_time).getTime();
  const endTime = new Date().getTime();
  
  // Calculate duration, round up to at least 1 minute
  const durationMs = endTime - startTime;
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
  
  // Amount calculation: duration_minutes * rate_per_minute
  const ratePerMinute = session.rate_per_minute || (compIndex >= 0 ? (computers[compIndex].rate_per_minute || 1.00) : 1.00);
  const finalAmount = durationMinutes * ratePerMinute;

  // Update session
  session.end_time = new Date().toISOString();
  session.duration_minutes = durationMinutes;
  session.amount = finalAmount;
  session.status = 'COMPLETED';

  // Move to past sessions
  const pastSessions = getPastSessions();
  pastSessions.push(session);
  sessions.splice(sessIndex, 1);

  setStorageItem('computers', computers);
  setStorageItem('sessions', sessions);
  setStorageItem('past_sessions', pastSessions);

  // Add dynamic transaction log
  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Ended Internet Session on ${session.computer_name} for ${session.customer_name}. Duration: ${durationMinutes} mins. Charged: ZMW ${finalAmount.toLocaleString()}`);

  return session;
};

// --- SYSTEM ACTIVITY LOGS ---
export const getActivityLogs = (): ActivityLog[] => {
  return getStorageItem<ActivityLog[]>('logs', INITIAL_LOGS);
};

export const addLog = (userId: string, userName: string, action: string): void => {
  const logs = getActivityLogs();
  const newLog: ActivityLog = {
    id: `log-${Date.now()}`,
    user_id: userId,
    user_name: userName,
    action,
    timestamp: new Date().toISOString()
  };
  logs.unshift(newLog); // Put newest first
  setStorageItem('logs', logs);
};

// --- WIFI TRACKER ---
export const getWifiRecords = (): WifiSessionRecord[] => {
  return getStorageItem<WifiSessionRecord[]>('wifi', INITIAL_WIFI);
};

export const addWifiRecord = (customerName: string, deviceName: string, durationMinutes: number, bandwidthMb: number): WifiSessionRecord => {
  const records = getWifiRecords();
  const newRec: WifiSessionRecord = {
    id: `wifi-${Date.now()}`,
    customer_name: customerName,
    device_name: deviceName,
    access_duration_minutes: durationMinutes,
    bandwidth_used_mb: bandwidthMb,
    created_at: new Date().toISOString()
  };
  records.unshift(newRec);
  setStorageItem('wifi', records);

  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Recorded guest WiFi allocation: ${customerName} (${bandwidthMb} MB, ${durationMinutes} mins)`);
  return newRec;
};

// --- WIFI CUSTOMERS ---
export const getLocalWifiCustomers = (): WifiCustomer[] => {
  return getStorageItem<WifiCustomer[]>('wifi_customers', INITIAL_WIFI_CUSTOMERS);
};

export const addLocalWifiCustomer = (name: string, phone: string, deviceName: string, macAddress: string): WifiCustomer => {
  const list = getLocalWifiCustomers();
  
  // Clean MAC formatting
  const formattedMac = macAddress.trim().toUpperCase();
  const existing = list.find(c => c.mac_address.toUpperCase() === formattedMac);
  
  if (existing) {
    existing.name = name;
    existing.phone = phone;
    existing.device_name = deviceName;
    setStorageItem('wifi_customers', list);
    return existing;
  }

  const newCust: WifiCustomer = {
    id: `wc-${Date.now()}`,
    name,
    phone,
    device_name: deviceName,
    mac_address: formattedMac,
    created_at: new Date().toISOString()
  };
  list.unshift(newCust);
  setStorageItem('wifi_customers', list);
  return newCust;
};

// --- WIFI PACKAGES ---
export const getLocalWifiPackages = (): WifiPackage[] => {
  return getStorageItem<WifiPackage[]>('wifi_packages', INITIAL_WIFI_PACKAGES);
};

export const addLocalWifiPackage = (name: string, durationMinutes: number, price: number): WifiPackage => {
  const list = getLocalWifiPackages();
  const newPkg: WifiPackage = {
    id: `wp-${Date.now()}`,
    name,
    duration_minutes: durationMinutes,
    price,
    created_at: new Date().toISOString()
  };
  list.push(newPkg);
  setStorageItem('wifi_packages', list);
  return newPkg;
};

// --- WIFI SESSIONS ---
export const getLocalWifiSessions = (): WifiSession[] => {
  const sessions = getStorageItem<WifiSession[]>('wifi_sessions', INITIAL_WIFI_SESSIONS);
  const customers = getLocalWifiCustomers();
  const packages = getLocalWifiPackages();

  // Map relationships
  return sessions.map(session => ({
    ...session,
    wifi_customers: customers.find(c => c.id === session.customer_id),
    wifi_packages: packages.find(p => p.id === session.package_id)
  }));
};

export const startLocalWifiSession = (
  customerName: string,
  phone: string,
  deviceName: string,
  macAddress: string,
  packageId: string
): WifiSession => {
  // 1. Create or resolve customer
  const customer = addLocalWifiCustomer(customerName, phone, deviceName, macAddress);
  
  // 2. Resolve package
  const packages = getLocalWifiPackages();
  const pkg = packages.find(p => p.id === packageId) || packages[0];

  const now = new Date();
  const endTime = new Date(now.getTime() + pkg.duration_minutes * 60 * 1000);

  const newSession: WifiSession = {
    id: `ws-${Date.now()}`,
    customer_id: customer.id,
    package_id: pkg.id,
    start_time: now.toISOString(),
    end_time: endTime.toISOString(),
    duration_minutes: pkg.duration_minutes,
    amount: pkg.price,
    status: 'ACTIVE',
    created_at: now.toISOString()
  };

  const sessions = getStorageItem<WifiSession[]>('wifi_sessions', INITIAL_WIFI_SESSIONS);
  sessions.unshift(newSession);
  setStorageItem('wifi_sessions', sessions);

  // Write connection log
  addLocalWifiUsageLog(customer.id, deviceName, macAddress, 'CONNECTED');

  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `Authorized WiFi Session for ${customer.name} (${pkg.name}, Device: ${deviceName})`);

  return {
    ...newSession,
    wifi_customers: customer,
    wifi_packages: pkg
  };
};

export const updateLocalWifiSessionStatus = (sessionId: string, newStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED'): boolean => {
  const sessions = getStorageItem<WifiSession[]>('wifi_sessions', INITIAL_WIFI_SESSIONS);
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index === -1) return false;

  const oldStatus = sessions[index].status;
  sessions[index].status = newStatus;
  setStorageItem('wifi_sessions', sessions);

  // If expiring/completing, add to logs
  if (newStatus === 'EXPIRED' || newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
    const customers = getLocalWifiCustomers();
    const cust = customers.find(c => c.id === sessions[index].customer_id);
    if (cust) {
      addLocalWifiUsageLog(cust.id, cust.device_name, cust.mac_address, newStatus === 'EXPIRED' ? 'EXPIRED' : 'DISCONNECTED');
    }
  }

  const currentUser = getCurrentUser();
  addLog(currentUser.id, currentUser.name, `WiFi session ${sessionId} status updated from ${oldStatus} to ${newStatus}`);
  return true;
};

// --- WIFI USAGE LOGS ---
export const getLocalWifiUsageLogs = (): WifiUsageLog[] => {
  const logs = getStorageItem<WifiUsageLog[]>('wifi_usage_logs', INITIAL_WIFI_LOGS);
  const customers = getLocalWifiCustomers();

  return logs.map(log => ({
    ...log,
    wifi_customers: customers.find(c => c.id === log.customer_id)
  }));
};

export const addLocalWifiUsageLog = (
  customerId: string,
  deviceName: string,
  macAddress: string,
  action: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED'
): WifiUsageLog => {
  const logs = getStorageItem<WifiUsageLog[]>('wifi_usage_logs', INITIAL_WIFI_LOGS);
  const newLog: WifiUsageLog = {
    id: `wl-${Date.now()}`,
    customer_id: customerId,
    device_name: deviceName,
    mac_address: macAddress.toUpperCase(),
    action,
    created_at: new Date().toISOString()
  };
  logs.unshift(newLog);
  setStorageItem('wifi_usage_logs', logs);
  return newLog;
};

// --- ROUTER SETTINGS ---
export const getLocalRouterSettings = (): RouterSetting[] => {
  return getStorageItem<RouterSetting[]>('router_settings', INITIAL_ROUTER_SETTINGS);
};

export const updateLocalRouterSettings = (routerName: string, routerBrand: string, routerModel: string, integrationType: string): RouterSetting => {
  const list = getLocalRouterSettings();
  const setting: RouterSetting = list[0] || { 
    id: 'r-1', 
    router_name: routerName,
    router_brand: routerBrand,
    router_model: routerModel,
    integration_type: integrationType,
    created_at: new Date().toISOString() 
  };
  
  setting.router_name = routerName;
  setting.router_brand = routerBrand;
  setting.router_model = routerModel;
  setting.integration_type = integrationType;

  if (list.length === 0) {
    list.push(setting);
  } else {
    list[0] = setting;
  }
  setStorageItem('router_settings', list);
  return setting;
};
