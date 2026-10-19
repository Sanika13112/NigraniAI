import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { ToastProvider } from './state/ToastContext';
import { AuthProvider } from './state/AuthContext';
import { CartProvider } from './state/CartContext';
import { WishlistProvider } from './state/WishlistContext';
import { StoreLayout } from './components/Layout';
import { PageLoader, RequireAdmin, RequireCustomer } from './components/Guards';
import { ErrorBoundary } from './components/ErrorBoundary';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import { Login, Register } from './pages/Auth';
import { Help, NotFound, Wishlist } from './pages/Misc';

const Checkout = lazy(() => import('./pages/Checkout'));
const Orders = lazy(() => import('./pages/Orders'));
const Returns = lazy(() => import('./pages/Orders').then((m) => ({ default: m.Returns })));
const AdminReviews = lazy(() => import('./admin/Reviews'));
const AdminDemo = lazy(() => import('./admin/DemoViolations'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Account = lazy(() => import('./pages/Account'));
const Terms = lazy(() => import('./pages/Terms'));
const Notifications = lazy(() => import('./pages/Account').then((m) => ({ default: m.Notifications })));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminOverview = lazy(() => import('./admin/Overview'));
const AdminOrders = lazy(() => import('./admin/Orders'));
const AdminProducts = lazy(() => import('./admin/Products'));
const AdminInventory = lazy(() => import('./admin/Inventory'));
const AdminCustomers = lazy(() => import('./admin/Customers'));
const AdminPayments = lazy(() => import('./admin/Payments'));
const AdminReports = lazy(() => import('./admin/Reports'));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route element={<StoreLayout />}>
                      <Route index element={<Home />} />
                      <Route path="shop" element={<Catalog />} />
                      <Route path="product/:id" element={<ProductDetail />} />
                      <Route path="cart" element={<Cart />} />
                      <Route path="wishlist" element={<Wishlist />} />
                      <Route path="help" element={<Help />} />
                      <Route path="terms" element={<Terms />} />
                      <Route path="login" element={<Login />} />
                      <Route path="register" element={<Register />} />
                      <Route path="checkout" element={<RequireCustomer><Checkout /></RequireCustomer>} />
                      <Route path="account" element={<RequireCustomer><Account /></RequireCustomer>} />
                      <Route path="account/orders" element={<RequireCustomer><Orders /></RequireCustomer>} />
                      <Route path="account/returns" element={<RequireCustomer><Returns /></RequireCustomer>} />
                      <Route path="account/orders/:id" element={<RequireCustomer><OrderDetail /></RequireCustomer>} />
                      <Route path="account/notifications" element={<RequireCustomer><Notifications /></RequireCustomer>} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                    <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                      <Route index element={<AdminOverview />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="inventory" element={<AdminInventory />} />
                      <Route path="customers" element={<AdminCustomers />} />
                      <Route path="payments" element={<AdminPayments />} />
                      <Route path="reports" element={<AdminReports />} />
                      <Route path="reviews" element={<AdminReviews />} />
                      <Route path="demo" element={<AdminDemo />} />
                    </Route>
                  </Routes>
                </Suspense>
                </ErrorBoundary>
              </BrowserRouter>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
