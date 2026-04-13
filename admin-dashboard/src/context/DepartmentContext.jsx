import { createContext, useContext, useState, useCallback } from 'react';

const DepartmentContext = createContext(null);

export function DepartmentProvider({ children }) {
  const [department, setDepartmentState] = useState({
    id: null,
    name: null,
    folderPath: null,
  });

  const setDepartment = useCallback(({ id, name, folderPath }) => {
    setDepartmentState({
      id: id ?? null,
      name: name ?? null,
      folderPath: folderPath ?? null,
    });
  }, []);

  const clearDepartment = useCallback(() => {
    setDepartmentState({ id: null, name: null, folderPath: null });
  }, []);

  const value = {
    department,
    setDepartment,
    clearDepartment,
  };

  return (
    <DepartmentContext.Provider value={value}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartment() {
  const ctx = useContext(DepartmentContext);
  return ctx ?? { department: {}, setDepartment: () => {}, clearDepartment: () => {} };
}
