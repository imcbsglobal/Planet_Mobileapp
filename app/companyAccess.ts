export interface CompanyAccessInfo {
  name: string;
  debtorsKey: string;
  stockReportKey: string;
}

export const COMPANY_ACCESS: CompanyAccessInfo[] = [
  { name: 'Sysmac Computers', debtorsKey: 'debtors-sysmac-computers', stockReportKey: 'stock-report-sysmac-computers' },
  { name: 'Sysmac Info', debtorsKey: 'debtors-sysmac-info', stockReportKey: 'stock-report-sysmac-info' },
  { name: 'IMCB LLP', debtorsKey: 'debtors-imcb-llb', stockReportKey: 'stock-report-imcb-llb' },
];

export function findCompanyAccess(companyName: string): CompanyAccessInfo | undefined {
  const n = companyName.trim().toLowerCase();
  return COMPANY_ACCESS.find((c) => c.name.trim().toLowerCase() === n);
}