/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import * as localDb from '../utils/db';
import {
  User, Product, Customer, Sale,
  PrintingOrder, Computer, CafeSession, ActivityLog,
  WifiSessionRecord, UserRole, PrintingStatus, ComputerStatus,
  CafeSessionStatus, WifiCustomer, WifiPackage, WifiSession,
  WifiUsageLog, RouterSetting
} from '../types';

// getCurrentOrganizationId lives in services/organizations.ts, which itself
// imports `supabase`/`isSupabaseConfigured` from this file. Both imports are
// only ever touched inside function bodies (never at module-eval time), so
// this circular reference resolves safely under Vite/ESM.
import { getCurrentOrganizationId, clearOrganizationCache, completeOrganizationSignup } from './organizations';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Helper error handler
const handleDbError = (error: any, fallbackMessage: string) => {
  console.warn(`Supabase action warning: ${error?.message || error}. Falling back to storage system.`);
};

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase configuration — running in local demo mode. Check your .env file.');
}

// Initialize Supabase Client with fallbacks to avoid crashes when unconfigured.
// Every exported function below checks `isSupabaseConfigured` before touching
// this client, so a placeholder URL/key here is inert, not a live connection.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
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

  if (!error && profile) {
    return mapProfileToUser(profile);
  }

  // A user who signed up via the Signup page but whose project requires
  // email confirmation has no profile yet — their organization name was
  // stashed in auth user_metadata at sign-up time (see
  // signUpNewOrganization in services/organizations.ts) because no session
  // existed then to complete it immediately. Their first successful login
  // is the first point we can act as them, so complete it here.
  const pendingOrgName = authUser.user_metadata?.org_name as string | undefined;
  if (pendingOrgName) {
    try {
      await completeOrganizationSignup(pendingOrgName, authUser.user_metadata?.owner_name || undefined);
      const { data: created } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle();
      if (created) return mapProfileToUser(created);
    } catch (signupErr: any) {
      // Most likely the organization name was taken by someone else between
      // sign-up and this first login. Fall through to the default STAFF
      // profile below so the account isn't stuck unable to log in at all —
      // an admin can assign them to an organization afterward.
      console.warn(`Deferred organization signup failed, falling back to a plain profile: ${signupErr?.message || signupErr}`);
    }
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
  }

  // Local demo mode — no live Supabase call, just match against the seeded local users.
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
  clearOrganizationCache();
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
      const organization_id = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('products')
        .insert([{
          name: product.name,
          category: product.category,
          quantity: product.quantity,
          buying_price: product.buying_price,
          selling_price: product.selling_price,
          supplier: product.supplier,
          organization_id
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
      const organization_id = await getCurrentOrganizationId();
      await supabase.from('inventory_transactions').insert([{
        product_id: productId,
        type: type,
        quantity: type === 'STOCK_IN' ? delta : -delta,
        created_by: user.id,
        organization_id
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
      const organization_id = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('customers')
        .insert([{ name, phone, email, organization_id }])
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
      const organization_id = await getCurrentOrganizationId();

      // 1. Calculate active totals
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

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
          created_by: currentUser.id,
          organization_id
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
        unit_price: item.unit_price,
        organization_id
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
      const organization_id = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('printing_orders')
        .insert([{
          customer_id: customerId,
          description,
          quantity,
          amount,
          amount_paid: amountPaid,
          created_by: user.id,
          organization_id
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
          last_seen: c.last_seen,
          cpu_usage: c.cpu_usage != null ? Number(c.cpu_usage) : null,
          ram_usage: c.ram_usage != null ? Number(c.ram_usage) : null,
          disk_usage: c.disk_usage != null ? Number(c.disk_usage) : null,
          hostname: c.hostname ?? null,
          ip_address: c.ip_address ?? null
        }));
      }
    } catch (err) {
      handleDbError(err, 'Failed fetching workstations catalogue');
    }
  }
  return localDb.getComputers();
}

/**
 * Count print jobs per workstation (computer_id -> job count).
 * Powers the "prints tracked" figure on each café station card.
 */
export async function fetchPrintCountsByComputer(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('computer_id');
    if (error) throw error;
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: any) => {
      if (row.computer_id) counts[row.computer_id] = (counts[row.computer_id] || 0) + 1;
    });
    return counts;
  } catch (err) {
    handleDbError(err, 'Failed counting print jobs per workstation');
    return {};
  }
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
      const organization_id = await getCurrentOrganizationId();
      const { error: sErr } = await supabase
        .from('cafe_sessions')
        .insert([{
          computer_id: computerId,
          customer_name: customerName,
          start_time: new Date().toISOString(),
          rate_per_minute: ratePerMinute,
          status: 'ACTIVE',
          organization_id
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

export async function insertLog(userId: string | null, action: string): Promise<void> {
  const currentUser = localDb.getCurrentUser();
  const name = currentUser ? currentUser.name : 'Worker_Profile';

  if (isSupabaseConfigured) {
    try {
      const organization_id = await getCurrentOrganizationId();
      const { error } = await supabase
        .from('activity_logs')
        .insert([{
          user_id: userId,
          action: action,
          organization_id
        }]);
      if (error) throw error;
      return;
    } catch (err) {
      handleDbError(err, 'Failed logging activity');
    }
  }

  localDb.addLog(userId || '', name, action);
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

      const organization_id = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('wifi_customers')
        .insert([{ name, phone, device_name, mac_address: cleanMac, organization_id }])
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
      const organization_id = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('wifi_packages')
        .insert([{ name, duration_minutes, price, organization_id }])
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
      const organization_id = await getCurrentOrganizationId();

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
          status: 'ACTIVE',
          organization_id
        }])
        .select('*, wifi_customers(*), wifi_packages(*)')
        .single();

      if (sessError) throw sessError;

      // 4. Record dynamic connection log
      await supabase.from('wifi_usage_logs').insert([{
        customer_id: cust.id,
        device_name: deviceName,
        mac_address: macAddress.toUpperCase(),
        action: 'CONNECTED',
        organization_id
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
          const organization_id = await getCurrentOrganizationId();
          await supabase.from('wifi_usage_logs').insert([{
            customer_id: cust.id,
            device_name: cust.device_name,
            mac_address: cust.mac_address,
            action: newStatus === 'EXPIRED' ? 'EXPIRED' : 'DISCONNECTED',
            organization_id
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
        const organization_id = await getCurrentOrganizationId();
        const { data, error } = await supabase
          .from('router_settings')
          .insert([{
            router_name: routerName,
            router_brand: routerBrand,
            router_model: routerModel,
            integration_type: integrationType,
            organization_id
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




// ==========================================
// 10. PRINT MANAGER MODULE
// ==========================================

import type {
  Printer, PrintJob, PaperInventory, PrintPricingSettings,
  PrintDashboardStats, DailyPrintTrend, PrintReportRow,
  PrinterStatus, PrintJobStatus, PaperSize, ColorMode
} from '../types';

// ---- helpers ----------------------------------------------------------------

const mapPrinter = (r: any): Printer => ({
  id: r.id,
  printer_name: r.printer_name,
  windows_printer_name: r.windows_printer_name,
  location: r.location ?? '',
  branch: r.branch ?? '',
  status: r.status as PrinterStatus,
  cost_per_bw_page: Number(r.cost_per_bw_page),
  cost_per_colour_page: Number(r.cost_per_colour_page),
  paper_sizes: r.paper_sizes ?? ['A4'],
  is_active: r.is_active ?? true,
  created_at: r.created_at,
  updated_at: r.updated_at
});

const mapPrintJob = (r: any): PrintJob => ({
  id: r.id,
  printer_id: r.printer_id,
  printer_name: r.printers?.printer_name ?? r.printer_name ?? '',
  computer_id: r.computer_id ?? null,
  computer_name: r.computers?.computer_name ?? r.computer_name ?? '',
  employee_id: r.employee_id ?? null,
  employee_name: r.users?.name ?? r.employee_name ?? '',
  customer_id: r.customer_id ?? null,
  customer_name: r.customers?.name ?? r.customer_name ?? '',
  session_id: r.session_id ?? null,
  document_name: r.document_name ?? null,
  page_count: r.page_count,
  color_mode: r.color_mode as ColorMode,
  paper_size: r.paper_size as PaperSize,
  cost: Number(r.cost),
  revenue: Number(r.revenue),
  profit: Number(r.profit ?? 0),
  status: r.status as PrintJobStatus,
  print_time: r.print_time,
  created_at: r.created_at
});

const mapPaperInventory = (r: any): PaperInventory => ({
  id: r.id,
  paper_size: r.paper_size as PaperSize,
  description: r.description ?? '',
  reams_purchased: Number(r.reams_purchased),
  reams_remaining: Number(r.reams_remaining),
  pages_per_ream: r.pages_per_ream,
  cost_per_ream: Number(r.cost_per_ream),
  min_stock_reams: Number(r.min_stock_reams),
  created_at: r.created_at,
  updated_at: r.updated_at
});

// ---- PRINTERS ---------------------------------------------------------------

export async function fetchPrinters(): Promise<Printer[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('printers')
      .select('*')
      .eq('is_active', true)
      .order('printer_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPrinter);
  } catch (err) {
    handleDbError(err, 'Failed fetching printers');
    return [];
  }
}

export async function fetchAllPrinters(): Promise<Printer[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('printers')
      .select('*')
      .order('printer_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPrinter);
  } catch (err) {
    handleDbError(err, 'Failed fetching all printers');
    return [];
  }
}

export async function insertPrinter(
  p: Omit<Printer, 'id' | 'created_at' | 'updated_at'>
): Promise<Printer | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const organization_id = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('printers')
      .insert([{ ...p, organization_id }])
      .select()
      .single();
    if (error) throw error;
    const user = localDb.getCurrentUser();
    await insertLog(user.id, `Registered printer: ${p.printer_name}`);
    return mapPrinter(data);
  } catch (err) {
    handleDbError(err, 'Failed inserting printer');
    return null;
  }
}

export async function updatePrinter(p: Printer): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('printers')
      .update({
        printer_name: p.printer_name,
        windows_printer_name: p.windows_printer_name,
        location: p.location,
        branch: p.branch,
        status: p.status,
        cost_per_bw_page: p.cost_per_bw_page,
        cost_per_colour_page: p.cost_per_colour_page,
        paper_sizes: p.paper_sizes,
        is_active: p.is_active
      })
      .eq('id', p.id);
    if (error) throw error;
    const user = localDb.getCurrentUser();
    await insertLog(user.id, `Updated printer: ${p.printer_name}`);
    return true;
  } catch (err) {
    handleDbError(err, 'Failed updating printer');
    return false;
  }
}

export async function disablePrinter(printerId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('printers')
      .update({ is_active: false })
      .eq('id', printerId);
    if (error) throw error;
    return true;
  } catch (err) {
    handleDbError(err, 'Failed disabling printer');
    return false;
  }
}

// ---- PRINT JOBS -------------------------------------------------------------

export async function fetchPrintJobs(opts?: {
  from?: string;
  to?: string;
  printerId?: string;
  computerId?: string;
  employeeId?: string;
  customerId?: string;
  limit?: number;
}): Promise<PrintJob[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let q = supabase
      .from('print_jobs')
      .select(`
        *,
        printers(printer_name),
        computers(computer_name),
        users(name),
        customers(name)
      `)
      .order('print_time', { ascending: false });

    if (opts?.from) q = q.gte('print_time', opts.from);
    if (opts?.to)   q = q.lte('print_time', opts.to);
    if (opts?.printerId)  q = q.eq('printer_id', opts.printerId);
    if (opts?.computerId) q = q.eq('computer_id', opts.computerId);
    if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
    if (opts?.customerId) q = q.eq('customer_id', opts.customerId);
    q = q.limit(opts?.limit ?? 500);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapPrintJob);
  } catch (err) {
    handleDbError(err, 'Failed fetching print jobs');
    return [];
  }
}

/** Called by the pc-agent and the manual-entry form */
export async function insertPrintJob(
  job: Omit<PrintJob, 'id' | 'profit' | 'created_at'>
): Promise<PrintJob | null> {
  if (!isSupabaseConfigured) return null;
  try {
    // Note: the actual Python pc-agent inserts print jobs via its own raw
    // REST call under the anon key and never runs this function, so it has
    // no organization context — those rows fall back to the default
    // organization (see database/migrations/001_multi_tenancy.sql). This
    // path is for the authenticated manual-entry form only.
    const organization_id = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('print_jobs')
      .insert([{
        printer_id: job.printer_id,
        computer_id: job.computer_id,
        employee_id: job.employee_id,
        customer_id: job.customer_id,
        session_id: job.session_id,
        document_name: job.document_name,
        page_count: job.page_count,
        color_mode: job.color_mode,
        paper_size: job.paper_size,
        cost: job.cost,
        revenue: job.revenue,
        status: job.status,
        print_time: job.print_time,
        organization_id
      }])
      .select(`
        *,
        printers(printer_name),
        computers(computer_name),
        users(name),
        customers(name)
      `)
      .single();
    if (error) throw error;
    return mapPrintJob(data);
  } catch (err) {
    handleDbError(err, 'Failed inserting print job');
    return null;
  }
}

// ---- PAPER INVENTORY --------------------------------------------------------

export async function fetchPaperInventory(): Promise<PaperInventory[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('paper_inventory')
      .select('*')
      .order('paper_size', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPaperInventory);
  } catch (err) {
    handleDbError(err, 'Failed fetching paper inventory');
    return [];
  }
}

export async function upsertPaperInventory(
  item: Omit<PaperInventory, 'id' | 'created_at' | 'updated_at'>
): Promise<PaperInventory | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const organization_id = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('paper_inventory')
      .upsert([{ ...item, organization_id }], { onConflict: 'organization_id,paper_size' })
      .select()
      .single();
    if (error) throw error;
    const user = localDb.getCurrentUser();
    await insertLog(user.id, `Updated paper inventory: ${item.paper_size}`);
    return mapPaperInventory(data);
  } catch (err) {
    handleDbError(err, 'Failed upserting paper inventory');
    return null;
  }
}

export async function addPaperStock(
  inventoryId: string,
  reamsDelta: number
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    // Use a raw RPC approach: read then update atomically
    const { data: current, error: readErr } = await supabase
      .from('paper_inventory')
      .select('reams_purchased, reams_remaining')
      .eq('id', inventoryId)
      .single();
    if (readErr || !current) throw readErr ?? new Error('Row not found');

    const { error } = await supabase
      .from('paper_inventory')
      .update({
        reams_purchased: Number(current.reams_purchased) + reamsDelta,
        reams_remaining: Number(current.reams_remaining) + reamsDelta
      })
      .eq('id', inventoryId);
    if (error) throw error;
    const user = localDb.getCurrentUser();
    await insertLog(user.id, `Added ${reamsDelta} reams to inventory ID ${inventoryId}`);
    return true;
  } catch (err) {
    handleDbError(err, 'Failed adding paper stock');
    return false;
  }
}

// ---- PRICING SETTINGS -------------------------------------------------------

export async function fetchPrintPricingSettings(): Promise<PrintPricingSettings | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('print_pricing_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      bw_price_per_page: Number(data.bw_price_per_page),
      colour_price_per_page: Number(data.colour_price_per_page),
      paper_cost_per_page: Number(data.paper_cost_per_page),
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  } catch (err) {
    handleDbError(err, 'Failed fetching print pricing settings');
    return null;
  }
}

/** Single organization-wide pricing row — updates it if present, otherwise creates it. */
export async function upsertPrintPricingSettings(
  s: Pick<PrintPricingSettings, 'bw_price_per_page' | 'colour_price_per_page' | 'paper_cost_per_page'>
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data: existing } = await supabase
      .from('print_pricing_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('print_pricing_settings').update(s).eq('id', existing.id)
      : await supabase.from('print_pricing_settings').insert([{ ...s, organization_id: await getCurrentOrganizationId() }]);
    if (error) throw error;
    const user = localDb.getCurrentUser();
    await insertLog(user.id, 'Updated print pricing settings');
    return true;
  } catch (err) {
    handleDbError(err, 'Failed saving print pricing settings');
    return false;
  }
}

// ---- DASHBOARD STATS --------------------------------------------------------

export async function fetchPrintDashboardStats(): Promise<PrintDashboardStats> {
  const empty: PrintDashboardStats = {
    pages_today: 0, bw_pages_today: 0, colour_pages_today: 0,
    revenue_today: 0, cost_today: 0, estimated_paper_used: 0,
    most_used_printer: '—', most_active_computer: '—',
    most_active_employee: '—', top_customer: '—',
    offline_printers: 0, total_printers: 0, daily_trend: []
  };

  if (!isSupabaseConfigured) return empty;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Today's jobs
    const { data: todayJobs } = await supabase
      .from('print_jobs')
      .select(`
        page_count, color_mode, revenue, cost, status,
        printer_id, printers(printer_name),
        computer_id, computers(computer_name),
        employee_id, users(name),
        customer_id, customers(name)
      `)
      .eq('status', 'Completed')
      .gte('print_time', todayStart.toISOString())
      .lte('print_time', todayEnd.toISOString());

    // Printers summary
    const { data: printerRows } = await supabase
      .from('printers')
      .select('id, status')
      .eq('is_active', true);

    // 7-day trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: trendJobs } = await supabase
      .from('print_jobs')
      .select('print_time, page_count, color_mode, revenue')
      .eq('status', 'Completed')
      .gte('print_time', sevenDaysAgo.toISOString());

    // Aggregate today
    const jobs = todayJobs ?? [];
    let pages = 0, bwPages = 0, colourPages = 0, revenue = 0, cost = 0;
    const printerFreq: Record<string, number> = {};
    const computerFreq: Record<string, number> = {};
    const employeeFreq: Record<string, number> = {};
    const customerFreq: Record<string, number> = {};

    jobs.forEach((j: any) => {
      pages += j.page_count;
      if (j.color_mode === 'Colour') colourPages += j.page_count;
      else bwPages += j.page_count;
      revenue += Number(j.revenue);
      cost += Number(j.cost);

      const pName = (j as any).printers?.printer_name ?? 'Unknown';
      const cName = (j as any).computers?.computer_name ?? '';
      const eName = (j as any).users?.name ?? '';
      const custName = (j as any).customers?.name ?? '';

      printerFreq[pName] = (printerFreq[pName] ?? 0) + j.page_count;
      if (cName) computerFreq[cName] = (computerFreq[cName] ?? 0) + j.page_count;
      if (eName) employeeFreq[eName] = (employeeFreq[eName] ?? 0) + j.page_count;
      if (custName) customerFreq[custName] = (customerFreq[custName] ?? 0) + j.page_count;
    });

    const topKey = (freq: Record<string, number>) => {
      const entries = Object.entries(freq);
      if (!entries.length) return '—';
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    };

    // Build 7-day trend
    const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const trendMap: Record<string, DailyPrintTrend> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = {
        date: dayLabels[d.getDay()],
        bw: 0, colour: 0, revenue: 0
      };
    }

    (trendJobs ?? []).forEach((j: any) => {
      const key = (j.print_time as string).slice(0, 10);
      if (trendMap[key]) {
        if (j.color_mode === 'Colour') trendMap[key].colour += j.page_count;
        else trendMap[key].bw += j.page_count;
        trendMap[key].revenue += Number(j.revenue);
      }
    });

    const totalPrinters = printerRows?.length ?? 0;
    const offlinePrinters = (printerRows ?? []).filter(
      (p: any) => p.status === 'Offline' || p.status === 'Error'
    ).length;

    return {
      pages_today: pages,
      bw_pages_today: bwPages,
      colour_pages_today: colourPages,
      revenue_today: revenue,
      cost_today: cost,
      estimated_paper_used: pages,
      most_used_printer: topKey(printerFreq),
      most_active_computer: topKey(computerFreq),
      most_active_employee: topKey(employeeFreq),
      top_customer: topKey(customerFreq),
      offline_printers: offlinePrinters,
      total_printers: totalPrinters,
      daily_trend: Object.values(trendMap)
    };
  } catch (err) {
    handleDbError(err, 'Failed fetching print dashboard stats');
    return empty;
  }
}

// ---- REPORTS ----------------------------------------------------------------

export async function fetchPrintReportByPrinter(from: string, to: string): Promise<PrintReportRow[]> {
  return _aggregatePrintReport('printer_id', 'printers(printer_name)', 'printers', from, to);
}

export async function fetchPrintReportByEmployee(from: string, to: string): Promise<PrintReportRow[]> {
  return _aggregatePrintReport('employee_id', 'users(name)', 'users', from, to);
}

export async function fetchPrintReportByCustomer(from: string, to: string): Promise<PrintReportRow[]> {
  return _aggregatePrintReport('customer_id', 'customers(name)', 'customers', from, to);
}

export async function fetchPrintReportByComputer(from: string, to: string): Promise<PrintReportRow[]> {
  return _aggregatePrintReport('computer_id', 'computers(computer_name)', 'computers', from, to);
}

async function _aggregatePrintReport(
  groupKey: string,
  joinSelect: string,
  joinTable: string,
  from: string,
  to: string
): Promise<PrintReportRow[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select(`id, ${groupKey}, page_count, color_mode, revenue, cost, profit, status, ${joinSelect}`)
      .eq('status', 'Completed')
      .gte('print_time', from)
      .lte('print_time', to);

    if (error) throw error;

    // Group in JS
    const grouped: Record<string, PrintReportRow> = {};
    (data ?? []).forEach((j: any) => {
      let rawId = j[groupKey];
      if (!rawId) rawId = '_unknown';

      let label = '—';
      if (joinTable === 'printers') label = j.printers?.printer_name ?? '—';
      else if (joinTable === 'users') label = j.users?.name ?? '—';
      else if (joinTable === 'customers') label = j.customers?.name ?? '—';
      else if (joinTable === 'computers') label = j.computers?.computer_name ?? '—';

      if (!grouped[rawId]) {
        grouped[rawId] = { label, jobs: 0, pages: 0, bw_pages: 0, colour_pages: 0, revenue: 0, cost: 0, profit: 0 };
      }
      grouped[rawId].jobs++;
      grouped[rawId].pages += j.page_count;
      if (j.color_mode === 'Colour') grouped[rawId].colour_pages += j.page_count;
      else grouped[rawId].bw_pages += j.page_count;
      grouped[rawId].revenue += Number(j.revenue);
      grouped[rawId].cost += Number(j.cost);
      grouped[rawId].profit += Number(j.profit ?? 0);
    });

    return Object.values(grouped).sort((a, b) => b.pages - a.pages);
  } catch (err) {
    handleDbError(err, `Failed generating print report by ${groupKey}`);
    return [];
  }
}
