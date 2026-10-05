import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { http, setUnauthorizedHandler, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const navigate = useNavigate();

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken('');
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setToken('');
    });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await http.post('/auth/login', { email, password });
    tokenStore.set(res.token);
    setToken(res.token);
    return res;
  }, []);

  const value = useMemo(() => ({ token, isAuthed: Boolean(token), login, logout }), [token, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { isAuthed } = useAuth();
  const location = useLocation();
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
