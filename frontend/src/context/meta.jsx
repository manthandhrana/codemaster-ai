import { createContext, useContext, useMemo } from 'react';
import { FullPageSpinner, ErrorState } from '../components/ui';
import { useApi } from '../lib/hooks';

const MetaContext = createContext(null);

/** Static app metadata from the backend: languages, difficulties, topics, providers. */
export function MetaProvider({ children }) {
  const { data, error, reload } = useApi('/meta');
  const value = useMemo(() => {
    if (!data) return null;
    const langMap = new Map(data.languages.map((l) => [l.id, l]));
    return {
      ...data,
      codingLanguages: data.languages.filter((l) => l.coding),
      language: (id) => langMap.get(id),
      langLabel: (id) => langMap.get(id)?.label || id,
      monaco: (id) => langMap.get(id)?.monaco || 'plaintext',
      boilerplate: (id) => langMap.get(id)?.boilerplate || '',
      reloadMeta: reload,
    };
  }, [data, reload]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} full />;
  if (!value) return <FullPageSpinner label="Loading CodeMaster…" />;
  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export const useMeta = () => useContext(MetaContext);
