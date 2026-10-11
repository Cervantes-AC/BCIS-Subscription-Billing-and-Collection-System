/**
 * API Client for BCIS Desktop
 * Handles all API communication with the Fastify backend
 */

import type { ApiResponse, PaginatedResponse } from '@bcis/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api/v1';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.loadTokens();
  }

  private loadTokens() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  private saveTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  private clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private expireSession() {
    this.clearTokens();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bcis:session-expired'));
  }

  private buildUrl(path: string, params?: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}, alreadyRetried = false): Promise<ApiResponse<T>> {
    const { params, headers, ...fetchOptions } = options;
    
    const url = this.buildUrl(path, params);
    
    const requestHeaders = new Headers(headers);
    if (fetchOptions.body !== undefined && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    if (this.accessToken) {
      requestHeaders.set('Authorization', `Bearer ${this.accessToken}`);
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
    });

    // Handle token refresh
    const isTokenEndpoint = ['/auth/login', '/auth/refresh', '/auth/logout'].includes(path);
    if (response.status === 401 && !isTokenEndpoint) {
      if (this.refreshToken && !alreadyRetried && await this.refreshAccessToken()) {
        return this.request<T>(path, options, true);
      }
      this.expireSession();
    }

    const data = await response.json().catch(() => ({})) as ApiResponse<T>;

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed with status ${response.status}`);
    }

    return data;
  }

  private refreshAccessToken(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performTokenRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performTokenRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.saveTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
    } catch {
      // Ignore
    }
    
    this.clearTokens();
    return false;
  }

  // Auth
  async login(username: string, password: string, rememberMe = false) {
    const response = await this.request<{ user: any; accessToken: string; refreshToken: string; expiresAt: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe }),
    });
    
    if (response.data) {
      this.saveTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearTokens();
    }
  }

  async getCurrentUser() {
    return this.request<{ user: any }>('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Generic CRUD
  async list<T>(path: string, params?: Record<string, any>) {
    return this.request<PaginatedResponse<T>>(path, { params });
  }

  async get<T = any>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>(path, { params });
  }

  async post<T>(path: string, data: any) {
    return this.create<T>(path, data);
  }

  async patch<T>(path: string, data: any) {
    return this.update<T>(path, data);
  }

  async create<T>(path: string, data: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update<T>(path: string, data: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }

  // File upload
  async upload(path: string, file: File, data?: Record<string, string>) {
    const formData = new FormData();
    formData.append('file', file);
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: formData,
    });

    return response.json() as Promise<ApiResponse<any>>;
  }

  // Print/PDF
  async printToPDF(path: string, options: any = {}) {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(options),
    });

    return response.blob();
  }

  // Subscribers
  async searchSubscribers(params: { q: string; limit?: number }) {
    return this.request('/subscribers/search', { params });
  }

  async listSubscribers(params: any) {
    return (await this.request<any>('/subscribers', { params })).data;
  }

  async getSubscriber(id: string) {
    return this.request(`/subscribers/${id}`);
  }

  async createSubscriber(data: any) {
    return this.request('/subscribers', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateSubscriber(id: string, data: any) {
    return this.request(`/subscribers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Plans
  async listPlans(params: any) {
    return (await this.request<any>('/plans', { params })).data;
  }

  async getPlan(id: string) {
    return this.request(`/plans/${id}`);
  }

  async createPlan(data: any) {
    return this.request('/plans', { method: 'POST', body: JSON.stringify(data) });
  }

  async updatePlan(id: string, data: any) {
    return this.request(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Service Accounts
  async listServiceAccounts(params: any) {
    return (await this.request<any>('/service-accounts', { params })).data;
  }

  async getServiceAccount(id: string) {
    return this.request(`/service-accounts/${id}`);
  }

  async createServiceAccount(data: any) {
    return this.request('/service-accounts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateServiceAccount(id: string, data: any) {
    return this.request(`/service-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Users
  async listUsers(params: any) {
    return (await this.request<any>('/users', { params })).data;
  }

  // Collection Areas
  async listCollectionAreas(params: any) {
    return (await this.request<any>('/collection-areas', { params })).data;
  }

  async assignCollector(areaId: string, collectorId: string) {
    return this.request(`/collection-areas/${areaId}/assign-collector`, {
      method: 'POST',
      body: JSON.stringify({ collectorId }),
    });
  }

  async listCollectionCollectors() {
    return (await this.request<any>('/collection-collectors')).data;
  }

  // Billing Cycles
  async listBillingCycles(params: any) {
    return (await this.request<any>('/billing-cycles', { params })).data;
  }

  async createBillingCycle(data: any) {
    return this.request('/billing-cycles', { method: 'POST', body: JSON.stringify(data) });
  }

  async generateBilling(data: any) {
    return this.request('/billing/generate', { method: 'POST', body: JSON.stringify(data) });
  }

  async finalizeBillingCycle(cycleId: string) {
    return this.request(`/billing-cycles/${cycleId}/finalize`, { method: 'POST' });
  }

  // Invoices
  async listInvoices(params: any) {
    return (await this.request<any>('/invoices', { params })).data;
  }

  async getInvoice(id: string) {
    return this.request(`/invoices/${id}`);
  }

  async voidInvoice(id: string, reason: string) {
    return this.request(`/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  // Payments
  async listPayments(params: any) {
    return (await this.request<any>('/payments', { params })).data;
  }

  async getPayment(id: string) {
    return this.request(`/payments/${id}`);
  }

  async createPayment(data: any) {
    return this.request('/payments', { method: 'POST', body: JSON.stringify(data) });
  }

  async reversePayment(id: string, reason: string) {
    return this.request(`/payments/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  async getAllocationPreview(subscriberId: string, amount: number) {
    return this.request('/payments/allocation-preview', {
      method: 'POST',
      body: JSON.stringify({ subscriberId, amount }),
    });
  }

  async getSubscriberCreditBalance(subscriberId: string) {
    return this.request(`/subscribers/${subscriberId}/credit-balance`);
  }

  // GCash Verification
  async getGCashQueue(params: any) {
    return (await this.request<any>('/gcash/queue', { params })).data;
  }

  async processGCashVerification(id: string, action: 'verify' | 'reject', rejectReason?: string, subscriberId?: string) {
    return this.request(`/gcash/queue/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, rejectReason, subscriberId }),
    });
  }

  // Collections
  async listCollectionBatches(params: any) {
    return (await this.request<any>('/collection-batches', { params })).data;
  }

  async getCollectionBatch(id: string) {
    return this.request(`/collection-batches/${id}`);
  }

  async createCollectionBatch(data: any) {
    return this.request('/collection-batches', { method: 'POST', body: JSON.stringify(data) });
  }

  async recordCollection(batchId: string, accountId: string, data: any) {
    return this.request(`/collection-batches/${batchId}/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async submitRemittance(batchId: string, data: any) {
    return this.request(`/collection-batches/${batchId}/remit`, { method: 'POST', body: JSON.stringify(data) });
  }

  async reconcileBatch(batchId: string, data: any) {
    return this.request(`/collection-batches/${batchId}/reconcile`, { method: 'POST', body: JSON.stringify(data) });
  }

  async closeBatch(batchId: string) {
    return this.request(`/collection-batches/${batchId}/close`, { method: 'POST' });
  }

  async getRouteSheet(batchId: string) {
    return this.request(`/collection-batches/${batchId}/route-sheet`);
  }

  // Receivables
  async getAgingReport(params: any) {
    return this.request('/receivables/aging', { params });
  }

  async getOverdueAccounts(params: any) {
    return this.request('/receivables/overdue', { params });
  }

  async getSuspensionCandidates(params: any) {
    return this.request('/receivables/suspension-candidates', { params });
  }

  async suspendServiceAccount(data: any) {
    return this.request(`/service-accounts/${data.serviceAccountId}/suspend`, { method: 'POST', body: JSON.stringify(data) });
  }

  async reconnectServiceAccount(data: any) {
    return this.request(`/service-accounts/${data.serviceAccountId}/reconnect`, { method: 'POST', body: JSON.stringify(data) });
  }

  // Reports
  private async download(url: string, alreadyRetried = false): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    });

    if (response.status === 401) {
      if (this.refreshToken && !alreadyRetried && await this.refreshAccessToken()) {
        return this.download(url, true);
      }
      this.expireSession();
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || payload?.message || `Download failed with status ${response.status}`);
    }
    return response.arrayBuffer();
  }

  async exportReport(type: string, params: any) {
    return this.download(this.buildUrl(`/reports/export/${type}`, params));
  }

  async getStatementOfAccountPDF(subscriberId: string, serviceAccountId?: string, dateFrom?: string, dateTo?: string) {
    const params: Record<string, string> = {};
    if (serviceAccountId) params.serviceAccountId = serviceAccountId;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;

    return this.download(this.buildUrl(`/subscribers/${subscriberId}/statement`, params));
  }

  getAccessToken() {
    return this.accessToken;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
