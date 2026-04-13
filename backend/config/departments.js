export const NYATSI_DEPARTMENTS = {
  ENGINEERING_SITE_REPORTS: {
    id: 'engineering_site_reports',
    label: 'Engineering Site Reports',
    folderPath: '/Engineering Site Reports',
    primaryUser: 'melusi',
  },
  ENGINEERING_DEPARTMENT: {
    id: 'engineering_department',
    label: 'Engineering Department',
    folderPath: '/Engineering Department',
    primaryUser: 'melusi',
  },
  FINANCE: {
    id: 'finance',
    label: 'Finance & Accounts',
    folderPath: '/Finance',
    primaryUser: 'finance_user',
  },
  IT_ADMIN: {
    id: 'admin',
    label: 'IT Administration',
    folderPath: '/',
    primaryUser: 'Inyatsi',
  },
};

export const NYATSI_DEPARTMENTS_LIST = Object.values(NYATSI_DEPARTMENTS);

export const NYATSI_DEPARTMENTS_BY_ID = NYATSI_DEPARTMENTS_LIST.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const NYATSI_DEPARTMENTS_BY_PRIMARY_USER = NYATSI_DEPARTMENTS_LIST.reduce((acc, item) => {
  acc[String(item.primaryUser || '').toLowerCase()] = item;
  return acc;
}, {});
