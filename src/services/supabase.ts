/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import * as localDb from '../utils/db';
import {
  User, Product, Customer, Sale, SaleItem,
  PrintingOrder, Computer, CafeSession, ActivityLog,
  WifiSessionRecord, UserRole, PrintingStatus, ComputerStatus,
  CafeSessionStatus, WifiCustomer, WifiPackage, WifiSession,
  WifiUsageLog, RouterSetting
} from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Initialize Supabase Client with fallbacks to avoid crashes

// Helper error handler
const handleDbError = (error: any, fallbackMessage: string) => {
  console.warn(`Supabase action warning: ${error?.message || error}. Falling back to storage system.`);
}; if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Check your .env file.'
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

// ==========================================
// 1. AUTHENTICATION & USERS
// ==========================================

const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  role: profile.role as UserRole,
  created_at: profile.created_at
});

async function fetchProfileForAuthUser(authUser: any): Promise<User | null> {
  if (!authUser?.id) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  console.log('Auth User:', authUser);
  console.log('Profile:', profile);
  console.log('Profile Error:', error);

  if (!error && profile) {
    return mapProfileToUser(profile);
  }

  const defaultProfile = {
    id: authUser.id,
    name: authUser.email?.split('@')[0] || 'Staff User',
    email: authUser.email || '',
    role: 'STAFF' as UserRole
  };

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert([defaultProfile])
    .select()
    .single();

  if (createError || !created) {
    console.warn(`Unable to load or create user profile: ${createError?.message || error?.message || 'Unknown profile error'}`);
    return null;
  }

  return mapProfileToUser(created);
}

function setCompatibilityUser(user: User): void {
  localDb.setCurrentUser(user);
}

export async function getAuthenticatedUser(): Promise<User | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) return null;

      const user = await fetchProfileForAuthUser(data.session.user);
      if (user) setCompatibilityUser(user);
      return user;
    } catch (err) {
      handleDbError(err, 'Failed restoring Supabase session');
      return null;
    }
  }

  const stored = localStorage.getItem('dubeman_current_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored) as User;
  } catch {
    localStorage.removeItem('dubeman_current_user');
    return null;
  }
}

export async function loginUser(email: string, password: string): Promise<User | null> {
  if (isSupabaseConfigured) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;
      if (!authData?.user) return null;

      const user = await fetchProfileForAuthUser(authData.user);
      if (user) setCompatibilityUser(user);
      return user;
    } catch (err: any) {
      console.error('Supabase login error:', err);
      throw err;
    }
  } const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email,
      password
    });

  console.log('AUTH DATA:', authData);
  console.log('AUTH ERROR:', authError);

  const localUsers = localDb.getAllUsers();
  const found = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (found) {
    localDb.setCurrentUser(found);
    return found;
  }
  return null;
}

export async function logoutUser(): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem('dubeman_current_user');
}

export async function fetchAllUsers(): Promise<User[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      if (data) return data.map(mapProfileToUser);
    } catch (err) {
      handleDbError(err, 'Failed fetching user profiles');
    }
  }
  return localDb.getAllUsers();
}

export async function createUserProfile(id: string, name: string, email: string, role: string): Promise<User | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{ id, name, email, role }])
        .select()
        .single();
      if (error) throw error;
      if (data) return mapProfileToUser(data);
    } catch (err) {
      handleDbError(err, 'Failed creating user profile in Supabase');
    }
  }

  const users = localDb.getAllUsers();
  const newUser = { id, name, email, role: role as UserRole, created_at: new Date().toISOString() };
  users.push(newUser);
  localStorage.setItem('dubeman_users', JSON.stringify(users));
  return newUser;
}

export async function updateUserRole(id: string, role: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (err) {
      handleDbError(err, 'Failed updating user role');
    }
  }

  const users = localDb.getAllUsers();
  const index = users.findIndex(u => u.id === id);
  if (index >= 0) {
    users[index].role = role as UserRole;
    localStorage.setItem('dubeman_users', JSON.stringify(users));
    return true;
  }
  return false;
}

// ==========================================
// 2. PRODUCTS MODULE (INVENTORY)
// ==========================================

export async function fetchProducts(): Promise<Product[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      if (data) {
        return data.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          quantity: p.quantity,
          buying_price: Number(p.buying_price),
          selling_price: Number(p.selling_price),
          supplier: p.supplier || '',
          created_at: p.created_at,
          updated_at: p.updated_at
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching products');
    }
  }
  return localDb.getProducts();
}

export async function insertProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          name: product.name,
          category: product.category,
          quantity: product.quantity,
          buying_price: product.buying_price,
          selling_price: product.selling_price,
          supplier: product.supplier
        }])
        .select()
        .single();
      if (error) throw error;
      if (data) {
        // Record action in logs
        const user = localDb.getCurrentUser();
        await insertLog(user.id, `Created new catalog product: ${product.name}`);
        return data;
      }
    } catch (err) {
      handleDbError(err, 'Failed to insert product');
    }
  }

  // Fallback
  const products = localDb.getProducts();
  const newProd: Product = {
    ...product,
    id: `p-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  products.push(newProd);
  localStorage.setItem('dubeman_products', JSON.stringify(products));

  const user = localDb.getCurrentUser();
  localDb.addLog(user.id, user.name, `Created new catalog product: ${product.name}`);
  return newProd;
}

export async function updateProduct(product: Product): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: product.name,
          category: product.category,
          quantity: product.quantity,
          buying_price: product.buying_price,
          selling_price: product.selling_price,
          supplier: product.supplier,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id);
      if (error) throw error;

      const user = localDb.getCurrentUser();
      await insertLog(user.id, `Updated product attributes for ID: ${product.id} (${product.name})`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed to update product');
    }
  }

  localDb.saveProduct(product);
  return true;
}

export async function adjustStockLevel(productId: string, delta: number, type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT'): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      // Fetch current quantity to adjust
      const { data: current, error: getErr } = await supabase
        .from('products')
        .select('quantity, name')
        .eq('id', productId)
        .single();

      if (getErr) throw getErr;

      const currentStock = current.quantity;
      if (type === 'STOCK_OUT' && currentStock < delta) {
        return false;
      }

      const finalQuantity = type === 'STOCK_IN' ? currentStock + delta : currentStock - delta;

      const { error: updErr } = await supabase
        .from('products')
        .update({ quantity: finalQuantity, updated_at: new Date().toISOString() })
        .eq('id', productId);

      if (updErr) throw updErr;

      // Insert transaction
      const user = localDb.getCurrentUser();
      await supabase.from('inventory_transactions').insert([{
        product_id: productId,
        type: type,
        quantity: type === 'STOCK_IN' ? delta : -delta,
        created_by: user.id
      }]);

      await insertLog(user.id, `Stock ${type === 'STOCK_IN' ? 'Replenishment' : 'Deduction'} for ${current.name}: ${delta} pieces. New stock: ${finalQuantity}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed to adjust stock');
    }
  }

  return localDb.modifyProductStock(productId, delta, type);
}


// ==========================================
// 3. CUSTOMERS MODULE
// ==========================================

export async function fetchCustomers(): Promise<Customer[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      handleDbError(err, 'Failed fetching customers');
    }
  }
  return localDb.getCustomers();
}

export async function insertCustomer(name: string, phone: string, email: string): Promise<Customer | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([{ name, phone, email }])
        .select()
        .single();
      if (error) throw error;

      const user = localDb.getCurrentUser();
      await insertLog(user.id, `Registered new client profile: ${name}`);
      return data;
    } catch (err) {
      handleDbError(err, 'Failed inserting customer');
    }
  }

  return localDb.addCustomer(name, phone, email);
}


// ==========================================
// 4. SALES & checkout transactional items
// ==========================================

export async function fetchSales(): Promise<Sale[]> {
  if (isSupabaseConfigured) {
    try {
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      // Fetch items for each sale
      const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('*, products(name)');

      if (itemsError) throw itemsError;

      if (sales) {
        return sales.map((s: any) => {
          const itemsFiltered = (saleItems || [])
            .filter((si: any) => si.sale_id === s.id)
            .map((si: any) => ({
              id: si.id,
              sale_id: si.sale_id,
              product_id: si.product_id,
              product_name: si.products?.name || 'Unknown Product',
              quantity: si.quantity,
              unit_price: Number(si.unit_price)
            }));

          return {
            id: s.id,
            customer_id: s.customer_id,
            customer_name: s.customers?.name || 'Walk-in Customer',
            total_amount: Number(s.total_amount),
            payment_method: s.payment_method,
            created_by: s.created_by || '',
            created_at: s.created_at,
            items: itemsFiltered
          };
        });
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching sales transactions');
    }
  }
  return localDb.getSales();
}

export async function insertSale(
  customerId: string | null,
  items: { product_id: string; quantity: number; unit_price: number }[],
  paymentMethod: 'Cash' | 'Mobile Money' | 'Bank'
): Promise<Sale | string> {
  const currentUser = localDb.getCurrentUser();

  if (isSupabaseConfigured) {
    try {
      // 1. Calculate active totals
      let totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

      // 2. Validate sufficient stocks first
      for (const item of items) {
        const { data: prod, error: pErr } = await supabase
          .from('products')
          .select('quantity, name')
          .eq('id', item.product_id)
          .single();
        if (pErr) throw pErr;
        if (prod.quantity < item.quantity) {
          return `Insufficient stock for: ${prod.name}. Available: ${prod.quantity}`;
        }
      }

      // 3. Create the sale row
      const { data: saleRow, error: sErr } = await supabase
        .from('sales')
        .insert([{
          customer_id: customerId || null,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          created_by: currentUser.id
        }])
        .select()
        .single();

      if (sErr) throw sErr;

      // 4. Create sale items. A trigger `tr_on_sale_item_insert` on Supabase will automatically
      // decrement product stocks and write inventory transaction rows!
      const saleItemsToInsert = items.map(item => ({
        sale_id: saleRow.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));

      const { data: insertedItems, error: itemsErr } = await supabase
        .from('sale_items')
        .insert(saleItemsToInsert)
        .select('*, products(name)');

      if (itemsErr) throw itemsErr;

      // 5. Fetch customer name if available
      let customerName = 'Walk-in Customer';
      if (customerId) {
        const { data: custRow } = await supabase
          .from('customers')
          .select('name')
          .eq('id', customerId)
          .single();
        if (custRow) customerName = custRow.name;
      }

      await insertLog(currentUser.id, `POS Sale Completed (Total: ${totalAmount.toFixed(2)}, Payment: ${paymentMethod})`);

      return {
        id: saleRow.id,
        customer_id: saleRow.customer_id,
        customer_name: customerName,
        total_amount: totalAmount,
        payment_method: saleRow.payment_method,
        created_by: currentUser.id,
        created_at: saleRow.created_at,
        items: (insertedItems || []).map((si: any) => ({
          id: si.id,
          sale_id: si.sale_id,
          product_id: si.product_id,
          product_name: si.products?.name || 'Product',
          quantity: si.quantity,
          unit_price: Number(si.unit_price)
        }))
      };

    } catch (err: any) {
      handleDbError(err, 'Failed to record complete checkout sale');
      return err?.message || 'Error occurred during checkout process';
    }
  }

  return localDb.createSale(customerId, items, paymentMethod);
}


// ==========================================
// 5. PRINTING ORDERS MODULE
// ==========================================

export async function fetchPrintingOrders(): Promise<PrintingOrder[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('printing_orders')
        .select('*, customers(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        return data.map((po: any) => ({
          id: po.id,
          customer_id: po.customer_id,
          customer_name: po.customers?.name || 'Walk-in Customer',
          customer_phone: po.customers?.phone || '',
          description: po.description,
          quantity: po.quantity,
          amount: Number(po.amount),
          amount_paid: Number(po.amount_paid),
          status: po.status as PrintingStatus,
          created_by: po.created_by || '',
          created_at: po.created_at
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching printing orders');
    }
  }
  return localDb.getPrintingOrders();
}

export async function insertPrintingOrder(
  customerId: string,
  description: string,
  quantity: number,
  amount: number,
  amountPaid: number
): Promise<PrintingOrder | null> {
  const user = localDb.getCurrentUser();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('printing_orders')
        .insert([{
          customer_id: customerId,
          description,
          quantity,
          amount,
          amount_paid: amountPaid,
          created_by: user.id
        }])
        .select('*, customers(*)')
        .single();

      if (error) throw error;
      if (data) {
        await insertLog(user.id, `Logged new Printing Order for ${data.customers?.name || 'Customer'}: ${description}`);
        return {
          id: data.id,
          customer_id: data.customer_id,
          customer_name: data.customers?.name || 'Walk-in Customer',
          customer_phone: data.customers?.phone || '',
          description: data.description,
          quantity: data.quantity,
          amount: Number(data.amount),
          amount_paid: Number(data.amount_paid),
          status: data.status as PrintingStatus,
          created_by: data.created_by,
          created_at: data.created_at
        };
      }
    } catch (err) {
      handleDbError(err, 'Failed inserting printing order');
    }
  }

  return localDb.addPrintingOrder(customerId, description, quantity, amount, amountPaid);
}

export async function advancePrintingOrderStatus(orderId: string, status: PrintingStatus): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('printing_orders')
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;
      const user = localDb.getCurrentUser();
      await insertLog(user.id, `Advanced Printing Order (${orderId}) status to ${status}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed advancing printing status');
    }
  }

  localDb.updatePrintingOrderStatus(orderId, status);
  return true;
}

export async function addPrintingOrderPayment(orderId: string, addedAmountPaid: number): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      // Get current paid amount
      const { data: po, error: getErr } = await supabase
        .from('printing_orders')
        .select('amount, amount_paid')
        .eq('id', orderId)
        .single();

      if (getErr) throw getErr;

      const newPaid = Math.min(Number(po.amount), Number(po.amount_paid) + addedAmountPaid);

      const { error: updErr } = await supabase
        .from('printing_orders')
        .update({ amount_paid: newPaid })
        .eq('id', orderId);

      if (updErr) throw updErr;

      const user = localDb.getCurrentUser();
      await insertLog(user.id, `Recorded initial/deposit payment of ZMW ${addedAmountPaid} for Printing Order (${orderId}). Total Paid: ${newPaid}/${po.amount}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed recording print order payment');
    }
  }

  localDb.updatePrintingOrderPayment(orderId, addedAmountPaid);
  return true;
}


// ==========================================
// 6. CAFE & WORKSTATION MODULE
// ==========================================

export async function fetchComputers(): Promise<Computer[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('computers')
        .select('*')
        .order('computer_name', { ascending: true });
      if (error) throw error;
      if (data) {
        return data.map((c: any) => ({
          id: c.id,
          computer_name: c.computer_name,
          computer_code: c.computer_code,
          status: c.status as ComputerStatus,
          hourly_rate: Number(c.hourly_rate || 60),
          rate_per_minute: Number(c.rate_per_minute !== undefined ? c.rate_per_minute : 1.00),
          last_seen: c.last_seen
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching workstations catalogue');
    }
  }
  return localDb.getComputers();
}

export async function updateComputerLockStatus(computerId: string, inMaintenance: boolean): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const newStatus = inMaintenance ? 'Maintenance' : 'Available';
      const { error } = await supabase
        .from('computers')
        .update({ status: newStatus, last_seen: new Date().toISOString() })
        .eq('id', computerId);

      if (error) throw error;

      const user = localDb.getCurrentUser();
      await insertLog(user.id, `Changed workstation ${computerId} mode to ${newStatus}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed modifying workstation properties');
    }
  }

  localDb.setComputerMaintenance(computerId, inMaintenance);
  return true;
}

export async function fetchRunningCafeSessions(): Promise<CafeSession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('cafe_sessions')
        .select('*, computers(computer_name, rate_per_minute)')
        .or('status.eq.ACTIVE,status.eq.Running')
        .order('start_time', { ascending: false });

      if (error) throw error;
      if (data) {
        return data.map((s: any) => {
          const status: CafeSessionStatus = s.status === 'Running' ? 'ACTIVE' : s.status;
          return {
            id: s.id,
            computer_id: s.computer_id,
            computer_name: s.computers?.computer_name || 'Terminal',
            customer_name: s.customer_name,
            start_time: s.start_time,
            end_time: s.end_time || undefined,
            duration_minutes: s.duration_minutes || undefined,
            rate_per_minute: Number(s.rate_per_minute !== undefined ? s.rate_per_minute : (s.computers?.rate_per_minute !== undefined ? s.computers.rate_per_minute : 1.00)),
            amount: s.amount ? Number(s.amount) : undefined,
            status
          };
        });
      }
    } catch (err) {
      handleDbError(err, 'Failed loading running café sessions');
    }
  }
  return localDb.getRunningSessions();
}

export async function fetchCompletedCafeSessions(): Promise<CafeSession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('cafe_sessions')
        .select('*, computers(computer_name, rate_per_minute)')
        .or('status.eq.COMPLETED,status.eq.Completed')
        .order('end_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (data) {
        return data.map((s: any) => {
          const status: CafeSessionStatus = s.status === 'Completed' ? 'COMPLETED' : s.status;
          return {
            id: s.id,
            computer_id: s.computer_id,
            computer_name: s.computers?.computer_name || 'Terminal',
            customer_name: s.customer_name,
            start_time: s.start_time,
            end_time: s.end_time || undefined,
            duration_minutes: s.duration_minutes || undefined,
            rate_per_minute: Number(s.rate_per_minute !== undefined ? s.rate_per_minute : (s.computers?.rate_per_minute !== undefined ? s.computers.rate_per_minute : 1.00)),
            amount: s.amount ? Number(s.amount) : undefined,
            status
          };
        });
      }
    } catch (err) {
      handleDbError(err, 'Failed loading completed sessions archiving ledger');
    }
  }
  return localDb.getPastSessions();
}

export async function startWorkstationSession(computerId: string, customerName: string): Promise<boolean> {
  const user = localDb.getCurrentUser();

  if (isSupabaseConfigured) {
    try {
      // 1. Get computer rate_per_minute
      const { data: comp } = await supabase
        .from('computers')
        .select('rate_per_minute')
        .eq('id', computerId)
        .single();
      const ratePerMinute = comp && comp.rate_per_minute !== undefined ? Number(comp.rate_per_minute) : 1.00;

      // 2. Update computer lock screen status to Occupied
      const { error: cErr } = await supabase
        .from('computers')
        .update({ status: 'Occupied', last_seen: new Date().toISOString() })
        .eq('id', computerId);

      if (cErr) throw cErr;

      // 3. Insert new running session row
      const { error: sErr } = await supabase
        .from('cafe_sessions')
        .insert([{
          computer_id: computerId,
          customer_name: customerName,
          start_time: new Date().toISOString(),
          rate_per_minute: ratePerMinute,
          status: 'ACTIVE'
        }]);

      if (sErr) throw sErr;

      await insertLog(user.id, `Started Internet Session on WC-ID ${computerId} for customer: ${customerName}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed to launch workstation terminal session');
    }
  }

  return localDb.startCafeSession(computerId, customerName);
}

export async function endWorkstationSession(sessionId: string): Promise<CafeSession | null> {
  const user = localDb.getCurrentUser();

  if (isSupabaseConfigured) {
    try {
      // 1. Fetch current session attributes
      const { data: session, error: getErr } = await supabase
        .from('cafe_sessions')
        .select('*, computers(*)')
        .eq('id', sessionId)
        .single();

      if (getErr) throw getErr;

      const startTime = new Date(session.start_time).getTime();
      const endTime = new Date().getTime();
      const durationMs = endTime - startTime;
      const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

      const ratePerMinute = session.rate_per_minute !== undefined ? Number(session.rate_per_minute) : (session.computers && session.computers.rate_per_minute !== undefined ? Number(session.computers.rate_per_minute) : 1.00);
      const finalAmount = durationMinutes * ratePerMinute;

      // 2. Set computer status back to Available
      await supabase
        .from('computers')
        .update({ status: 'Available', last_seen: new Date().toISOString() })
        .eq('id', session.computer_id);

      // 3. Update session row
      const { data: updatedSession, error: updErr } = await supabase
        .from('cafe_sessions')
        .update({
          end_time: new Date().toISOString(),
          duration_minutes: durationMinutes,
          amount: finalAmount,
          status: 'COMPLETED'
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (updErr) throw updErr;

      await insertLog(user.id, `Ended Internet Session for ${session.customer_name}. Duration: ${durationMinutes} mins. Amount: ZMW ${finalAmount}`);

      return {
        id: updatedSession.id,
        computer_id: updatedSession.computer_id,
        computer_name: session.computers?.computer_name || 'Terminal',
        customer_name: updatedSession.customer_name,
        start_time: updatedSession.start_time,
        end_time: updatedSession.end_time || undefined,
        duration_minutes: updatedSession.duration_minutes || undefined,
        rate_per_minute: Number(updatedSession.rate_per_minute !== undefined ? updatedSession.rate_per_minute : ratePerMinute),
        amount: Number(updatedSession.amount),
        status: updatedSession.status as any
      };
    } catch (err) {
      handleDbError(err, 'Failed to terminate workstation terminal session');
    }
  }

  return localDb.terminateCafeSession(sessionId);
}


// ==========================================
// 7. SECURITY AUDITING SYSTEM & LOGS
// ==========================================

export async function fetchActivityLogs(): Promise<ActivityLog[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, users(name)')
        .order('timestamp', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (data) {
        return data.map((log: any) => ({
          id: log.id,
          user_id: log.user_id || '',
          user_name: log.users?.name || 'System Auto-Agent',
          action: log.action,
          timestamp: log.timestamp
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching activity auditing trails');
    }
  }
  return localDb.getActivityLogs();
}

export async function insertLog(userId: string, action: string): Promise<void> {
  const currentUser = localDb.getCurrentUser();
  const name = currentUser ? currentUser.name : 'Worker_Profile';

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert([{
          user_id: userId,
          action: action
        }]);
      if (error) throw error;
      return;
    } catch (err) {
      handleDbError(err, 'Failed logging activity');
    }
  }

  localDb.addLog(userId, name, action);
}

// ==========================================
// 8. WIFI COMPLIANT SIMULATOR LOGS (DEPRECATED)
// ==========================================

export async function fetchWifiRecords(): Promise<WifiSessionRecord[]> {
  return localDb.getWifiRecords();
}

export async function insertWifiRecord(customerName: string, deviceName: string, durationMinutes: number, bandwidthMb: number): Promise<WifiSessionRecord> {
  const record = localDb.addWifiRecord(customerName, deviceName, durationMinutes, bandwidthMb);
  return record;
}

// ==========================================
// 9. ADVANCED WIFI CONTROL & USAGE MANAGEMENT
// ==========================================

export async function fetchWifiCustomers(): Promise<WifiCustomer[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('wifi_customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      handleDbError(err, 'Failed to fetch WiFi Customers');
    }
  }
  return localDb.getLocalWifiCustomers();
}

export async function createWifiCustomer(name: string, phone: string, device_name: string, mac_address: string): Promise<WifiCustomer> {
  if (isSupabaseConfigured) {
    try {
      // Format MAC
      const cleanMac = mac_address.trim().toUpperCase();

      // Check if already exists first to avoid uniqueness constraint crashes
      const { data: existing, error: findError } = await supabase
        .from('wifi_customers')
        .select('*')
        .eq('mac_address', cleanMac)
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        // Update name/phone
        const { data: updated, error: updError } = await supabase
          .from('wifi_customers')
          .update({ name, phone, device_name })
          .eq('id', existing.id)
          .select()
          .single();
        if (updError) throw updError;
        return updated;
      }

      const { data, error } = await supabase
        .from('wifi_customers')
        .insert([{ name, phone, device_name, mac_address: cleanMac }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      handleDbError(err, 'Failed to create WiFi Customer');
    }
  }
  return localDb.addLocalWifiCustomer(name, phone, device_name, mac_address);
}

export async function fetchWifiPackages(): Promise<WifiPackage[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('wifi_packages')
        .select('*')
        .order('duration_minutes', { ascending: true });
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      handleDbError(err, 'Failed to fetch WiFi Packages');
    }
  }
  return localDb.getLocalWifiPackages();
}

export async function createWifiPackage(name: string, duration_minutes: number, price: number): Promise<WifiPackage> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('wifi_packages')
        .insert([{ name, duration_minutes, price }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      handleDbError(err, 'Failed to create WiFi Package');
    }
  }
  return localDb.addLocalWifiPackage(name, duration_minutes, price);
}

export async function fetchWifiSessions(): Promise<WifiSession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('wifi_sessions')
        .select('*, wifi_customers(*), wifi_packages(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        return data.map((item: any) => ({
          id: item.id,
          customer_id: item.customer_id,
          package_id: item.package_id,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: item.duration_minutes,
          amount: Number(item.amount),
          status: item.status,
          created_at: item.created_at,
          wifi_customers: item.wifi_customers,
          wifi_packages: item.wifi_packages
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed to fetch WiFi Sessions');
    }
  }
  return localDb.getLocalWifiSessions();
}

export async function startWifiSession(
  customerName: string,
  phone: string,
  deviceName: string,
  macAddress: string,
  packageId: string
): Promise<WifiSession | null> {
  const currentUser = localDb.getCurrentUser();
  const userName = currentUser ? currentUser.name : 'Console_Staff';

  if (isSupabaseConfigured) {
    try {
      // 1. Create/Ensure Customer profile
      const cust = await createWifiCustomer(customerName, phone, deviceName, macAddress);

      // 2. Resolve package details
      const { data: pkg, error: pkgError } = await supabase
        .from('wifi_packages')
        .select('*')
        .eq('id', packageId)
        .single();
      if (pkgError) throw pkgError;

      const now = new Date();
      const endTime = new Date(now.getTime() + pkg.duration_minutes * 60 * 1000);

      // 3. Insert Wifi Session
      const { data: session, error: sessError } = await supabase
        .from('wifi_sessions')
        .insert([{
          customer_id: cust.id,
          package_id: pkg.id,
          start_time: now.toISOString(),
          end_time: endTime.toISOString(),
          duration_minutes: pkg.duration_minutes,
          amount: pkg.price,
          status: 'ACTIVE'
        }])
        .select('*, wifi_customers(*), wifi_packages(*)')
        .single();

      if (sessError) throw sessError;

      // 4. Record dynamic connection log
      await supabase.from('wifi_usage_logs').insert([{
        customer_id: cust.id,
        device_name: deviceName,
        mac_address: macAddress.toUpperCase(),
        action: 'CONNECTED'
      }]);

      await insertLog(currentUser.id, `Authorized WiFi Session for ${customerName} (${pkg.name})`);

      return {
        id: session.id,
        customer_id: session.customer_id,
        package_id: session.package_id,
        start_time: session.start_time,
        end_time: session.end_time,
        duration_minutes: session.duration_minutes,
        amount: Number(session.amount),
        status: session.status,
        created_at: session.created_at,
        wifi_customers: session.wifi_customers,
        wifi_packages: session.wifi_packages
      };
    } catch (err) {
      handleDbError(err, 'Failed to start WiFi Session');
    }
  }

  return localDb.startLocalWifiSession(customerName, phone, deviceName, macAddress, packageId);
}

export async function updateWifiSessionStatus(sessionId: string, newStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED'): Promise<boolean> {
  const currentUser = localDb.getCurrentUser();

  if (isSupabaseConfigured) {
    try {
      const { data: oldSess, error: getErr } = await supabase
        .from('wifi_sessions')
        .select('*, wifi_customers(*)')
        .eq('id', sessionId)
        .single();

      if (getErr) throw getErr;

      const { error: updError } = await supabase
        .from('wifi_sessions')
        .update({ status: newStatus })
        .eq('id', sessionId);

      if (updError) throw updError;

      // Log the event in usage logs if changing from ACTIVE
      if (newStatus === 'EXPIRED' || newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
        const cust = oldSess.wifi_customers;
        if (cust) {
          await supabase.from('wifi_usage_logs').insert([{
            customer_id: cust.id,
            device_name: cust.device_name,
            mac_address: cust.mac_address,
            action: newStatus === 'EXPIRED' ? 'EXPIRED' : 'DISCONNECTED'
          }]);
        }
      }

      await insertLog(currentUser.id, `WiFi Session status updated to ${newStatus} for ID: ${sessionId}`);
      return true;
    } catch (err) {
      handleDbError(err, 'Failed to update WiFi Session status');
    }
  }

  return localDb.updateLocalWifiSessionStatus(sessionId, newStatus);
}

export async function fetchWifiUsageLogs(): Promise<WifiUsageLog[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('wifi_usage_logs')
        .select('*, wifi_customers(*)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (data) {
        return data.map((item: any) => ({
          id: item.id,
          customer_id: item.customer_id,
          device_name: item.device_name,
          mac_address: item.mac_address,
          action: item.action,
          created_at: item.created_at,
          wifi_customers: item.wifi_customers
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed to fetch WiFi Usage logs');
    }
  }
  return localDb.getLocalWifiUsageLogs();
}

export async function fetchRouterSettings(): Promise<RouterSetting[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('router_settings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      handleDbError(err, 'Failed to fetch Router settings');
    }
  }
  return localDb.getLocalRouterSettings();
}

export async function saveRouterSettings(
  routerName: string,
  routerBrand: string,
  routerModel: string,
  integrationType: string
): Promise<RouterSetting | null> {
  if (isSupabaseConfigured) {
    try {
      const settings = await fetchRouterSettings();
      if (settings.length > 0) {
        const { data, error } = await supabase
          .from('router_settings')
          .update({
            router_name: routerName,
            router_brand: routerBrand,
            router_model: routerModel,
            integration_type: integrationType
          })
          .eq('id', settings[0].id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('router_settings')
          .insert([{
            router_name: routerName,
            router_brand: routerBrand,
            router_model: routerModel,
            integration_type: integrationType
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } catch (err) {
      handleDbError(err, 'Failed to save Router Settings');
    }
  }
  return localDb.updateLocalRouterSettings(routerName, routerBrand, routerModel, integrationType);
}


