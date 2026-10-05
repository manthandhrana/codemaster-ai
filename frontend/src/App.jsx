import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import { AuthProvider, RequireAuth } from './context/auth';
import { MetaProvider } from './context/meta';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Problems from './pages/Problems';

// Heavier pages (Monaco editor, charts) are split into their own chunks.
const Solve = lazy(() => import('./pages/Solve'));
const Generate = lazy(() => import('./pages/Generate'));
const Prompts = lazy(() => import('./pages/Prompts'));
const Automation = lazy(() => import('./pages/Automation'));
const Providers = lazy(() => import('./pages/Providers'));
const Usage = lazy(() => import('./pages/Usage'));
const Settings = lazy(() => import('./pages/Settings'));

export default function App() {
  return (
    <AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <MetaProvider>
                <Layout />
              </MetaProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="problems" element={<Problems />} />
          <Route path="problems/:id" element={<Solve />} />
          <Route path="generate" element={<Generate />} />
          <Route path="prompts" element={<Prompts />} />
          <Route path="automation" element={<Automation />} />
          <Route path="providers" element={<Providers />} />
          <Route path="usage" element={<Usage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
