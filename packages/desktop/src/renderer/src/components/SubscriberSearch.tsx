/**
 * Subscriber Search Component
 */
import React, { useState, useEffect } from 'react';
import { Search, User, Phone, MapPin, X } from 'lucide-react';
import { api } from '../lib/api';

interface SubscriberSearchResult {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  email?: string;
  status: string;
  totalArrears?: number;
  serviceAccounts?: any[];
}

interface SubscriberSearchProps {
  onSelect: (subscriber: SubscriberSearchResult) => void;
  selected?: SubscriberSearchResult | null;
}

export function SubscriberSearch({ onSelect, selected }: SubscriberSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubscriberSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const search = async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.searchSubscribers({ q, limit: 10 });
      setResults(response.data.subscribers || []);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (subscriber: SubscriberSearchResult) => {
    onSelect(subscriber);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search by name, account #, phone..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showResults && (isLoading || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-auto z-10">
          {isLoading ? (
            <div className="p-4 text-center text-text-muted">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-text-muted">No subscribers found</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {results.map((subscriber) => (
                <li
                  key={subscriber.id}
                  onClick={() => handleSelect(subscriber)}
                  className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selected?.id === subscriber.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-text-primary">
                          {subscriber.firstName} {subscriber.lastName}
                        </p>
                        <p className="text-xs text-text-muted">{subscriber.accountNumber}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {subscriber.contactNumber}
                      </p>
                      {subscriber.totalArrears && subscriber.totalArrears > 0 && (
                        <p className="text-xs text-red-600 font-medium mt-1">
                          Due: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(subscriber.totalArrears / 100)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}