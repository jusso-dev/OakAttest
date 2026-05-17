'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

type DirtyItem = {
  label?: string;
};

type UnsavedChangesContextValue = {
  setDirty: (id: string, dirty: boolean, item?: DirtyItem) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const warning =
  'You have unsaved changes in this engagement. Leave this page and discard them?';

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [dirtyItems, setDirtyItems] = useState<Map<string, DirtyItem>>(new Map());
  const hasUnsavedChanges = dirtyItems.size > 0;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    currentUrlRef.current = window.location.href;
  }, []);

  const setDirty = useCallback((id: string, dirty: boolean, item?: DirtyItem) => {
    setDirtyItems((current) => {
      const next = new Map(current);
      if (dirty) {
        next.set(id, item ?? {});
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = warning;
    }

    function onDocumentClick(event: MouseEvent) {
      if (!hasUnsavedChangesRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const ok = window.confirm(warning);
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onPopState() {
      if (!hasUnsavedChangesRef.current) return;
      const ok = window.confirm(warning);
      if (ok) return;

      const currentUrl = currentUrlRef.current;
      if (currentUrl) {
        window.history.pushState(window.history.state, '', currentUrl);
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, []);

  const value = useMemo(() => ({ setDirty }), [setDirty]);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(dirty: boolean, label?: string) {
  const context = useContext(UnsavedChangesContext);
  const id = useId();

  useEffect(() => {
    context?.setDirty(id, dirty, { label });
    return () => context?.setDirty(id, false);
  }, [context, dirty, id, label]);
}
