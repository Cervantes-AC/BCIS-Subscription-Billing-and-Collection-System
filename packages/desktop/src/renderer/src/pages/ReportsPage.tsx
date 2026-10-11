/**
 * Reports Page - PDF/XLSX Report Generation
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Download, FileSpreadsheet, FileText, Calendar, 
  Loader2, ChevronDown,
  BarChart2, Users, DollarSign, TrendingUp
} from 'lucide-react';
import { api } from '../lib/api';

type ReportType = 
  | 'monthly-collection'
  | 'ar-aging'
  | 'collector-remittance'
  | 'billing-vs-collection'
  | 'statement-of-account';

interface ReportConfig {
  type: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  formats: ('pdf' | 'xlsx')[];
  params: string[];
}

const REPORTS: ReportConfig[] = [
  {
    type: 'monthly-collection',
    label: 'Monthly Collection Report',
    description: 'Summary of collections by payment method for a given month',
    icon: <DollarSign className="w-5 h-5" />,
    formats: ['xlsx'],
    params: ['month', 'collectorId', 'areaId'],
  },
  {
    type: 'ar-aging',
    label: 'AR Aging Report',
    description: 'Accounts receivable aging by bucket (Current, 1-30, 31-60, 61-90, 90+)',
    icon: <BarChart2 className="w-5 h-5" />,
    formats: ['xlsx'],
    params: ['asOfDate', 'collectorId', 'areaId'],
  },
  {
    type: 'collector-remittance',
    label: 'Collector Remittance Report',
    description: 'Remittance details per collector with shortages/overages',
    icon: <Users className="w-5 h-5" />,
    formats: ['xlsx'],
    params: ['dateFrom', 'dateTo', 'collectorId'],
  },
  {
    type: 'billing-vs-collection',
    label: 'Billing vs Collection Report',
    description: 'Compare billed amounts vs collected amounts by month',
    icon: <TrendingUp className="w-5 h-5" />,
    formats: ['xlsx'],
    params: ['dateFrom', 'dateTo'],
  },
  {
    type: 'statement-of-account',
    label: 'Statement of Account (PDF)',
    description: 'Detailed ledger for a subscriber/service account',
    icon: <FileText className="w-5 h-5" />,
    formats: ['pdf'],
    params: ['subscriberId', 'serviceAccountId', 'dateFrom', 'dateTo'],
  },
];

export function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [reportParams, setReportParams] = useState<Record<string, any>>({});
  const [generatingReport, setGeneratingReport] = useState<ReportType | null>(null);

  const { data: collectors } = useQuery({
    queryKey: ['collectors'],
    queryFn: () => api.listUsers({ role: 'collector', limit: 200 }),
  });

  const { data: areas } = useQuery({
    queryKey: ['collection-areas'],
    queryFn: () => api.listCollectionAreas({ limit: 200 }),
  });

  const { data: subscribers } = useQuery({
    queryKey: ['subscribers', 'all'],
    queryFn: () => api.searchSubscribers({ q: '', limit: 200 }),
  });

  const handleGenerateReport = async (reportType: ReportType, params: Record<string, any>) => {
    setGeneratingReport(reportType);
    try {
      let blob: Blob;
      let filename: string;

      switch (reportType) {
        case 'monthly-collection': {
          const buffer = await api.exportReport('collection', {
            format: 'xlsx',
            date: params.month,
            collectorId: params.collectorId,
            areaId: params.areaId,
          });
          blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          filename = `monthly-collection-${params.month}.xlsx`;
          break;
        }
        case 'ar-aging': {
          const buffer = await api.exportReport('aging', {
            format: 'xlsx',
            asOfDate: params.asOfDate,
            collectorId: params.collectorId,
            areaId: params.areaId,
          });
          blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          filename = `ar-aging-${params.asOfDate}.xlsx`;
          break;
        }
        case 'collector-remittance': {
          const buffer = await api.exportReport('collector', {
            format: 'xlsx',
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            collectorId: params.collectorId,
          });
          blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          filename = `collector-remittance-${params.dateFrom}-to-${params.dateTo}.xlsx`;
          break;
        }
        case 'billing-vs-collection': {
          const buffer = await api.exportReport('billing-vs-collection', {
            format: 'xlsx',
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
          });
          blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          filename = `billing-vs-collection-${params.dateFrom}-to-${params.dateTo}.xlsx`;
          break;
        }
        case 'statement-of-account': {
          const buffer = await api.getStatementOfAccountPDF(
            params.subscriberId,
            params.serviceAccountId,
            params.dateFrom,
            params.dateTo
          );
          blob = new Blob([buffer], { type: 'application/pdf' });
          filename = `statement-${params.subscriberId}-${params.dateFrom || 'all'}.pdf`;
          break;
        }
        default:
          throw new Error('Unknown report type');
      }

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Report generation failed:', error);
      alert('Failed to generate report: ' + (error as Error).message);
    } finally {
      setGeneratingReport(null);
    }
  };

  const renderReportConfig = (report: ReportConfig) => {
    const paramInputs: React.ReactNode[] = [];

    report.params.forEach(param => {
      switch (param) {
        case 'month':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">Month <span className="text-red-500">*</span></label>
              <input
                type="month"
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          );
          break;
        case 'asOfDate':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">As of Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={reportParams[param] || new Date().toISOString().split('T')[0]}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          );
          break;
        case 'dateFrom':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">From Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          );
          break;
        case 'dateTo':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">To Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={reportParams[param] || new Date().toISOString().split('T')[0]}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          );
          break;
        case 'collectorId':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">Collector</label>
              <select
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Collectors</option>
                {collectors?.items?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
          );
          break;
        case 'areaId':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">Area</label>
              <select
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Areas</option>
                {areas?.items?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          );
          break;
        case 'subscriberId':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">Subscriber <span className="text-red-500">*</span></label>
              <select
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Select Subscriber</option>
                {subscribers?.subscribers?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.accountNumber} - {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </div>
          );
          break;
        case 'serviceAccountId':
          paramInputs.push(
            <div key={param} className="md:w-1/2">
              <label className="block text-sm font-medium mb-2">Service Account (Optional)</label>
              <select
                value={reportParams[param] || ''}
                onChange={(e) => setReportParams({ ...reportParams, [param]: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Service Accounts</option>
                {/* Would filter by selected subscriber */}
              </select>
            </div>
          );
          break;
      }
    });

    return (
      <div className="bg-surface rounded-lg p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedReport(null); setReportParams({}); }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <span className="p-2 bg-primary/10 rounded-lg text-primary">{report.icon}</span>
                <div>
                  <h3 className="font-semibold">{report.label}</h3>
                  <p className="text-sm text-text-muted">{report.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGenerateReport(report.type, reportParams);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paramInputs}
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => { setSelectedReport(null); setReportParams({}); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generatingReport === report.type}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {generatingReport === report.type ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate & Download
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  };

  if (selectedReport) {
    const report = REPORTS.find(r => r.type === selectedReport);
    if (report) return renderReportConfig(report);
  }

  return (
    <section className="p-6">
      <h2 className="page-title mb-6">Reports</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
          <button
            key={report.type}
            onClick={() => setSelectedReport(report.type)}
            className="bg-surface rounded-lg p-6 hover:shadow-lg transition-shadow text-left h-full flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="p-3 bg-primary/10 rounded-lg text-primary">
                {report.icon}
              </span>
              <div>
                <h3 className="font-semibold text-text-primary">{report.label}</h3>
                <p className="text-sm text-text-muted">{report.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-4">
              {report.formats.map(format => (
                <span
                  key={format}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                >
                  {format.toUpperCase()}
                </span>
              ))}
            </div>
            <div className="mt-auto pt-4 border-t flex items-center gap-2 text-primary font-medium">
              <Download className="w-4 h-4" />
              <span>Generate Report</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}