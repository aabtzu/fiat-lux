'use client';

import { useState, useEffect, useRef } from 'react';

interface Share {
  id: string;
  fileId: string;
  shareType: 'link' | 'user';
  shareToken: string | null;
  sharedWithUserId: string | null;
  sharedWithEmail?: string;
  canEdit: boolean;
  createdAt: string;
}

interface ShareDialogProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export default function ShareDialog({ fileId, fileName, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkShare, setLinkShare] = useState<Share | null>(null);
  const [userShares, setUserShares] = useState<Share[]>([]);
  const [email, setEmail] = useState('');
  const [emailSuggestions, setEmailSuggestions] = useState<{ id: string; email: string; displayName: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchShares();
  }, [fileId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const fetchShares = async () => {
    try {
      const response = await fetch(`/api/shares?fileId=${fileId}`);
      if (response.ok) {
        const data = await response.json();
        setShares(data.shares || []);
        setLinkShare(data.shares?.find((s: Share) => s.shareType === 'link') || null);
        setUserShares(data.shares?.filter((s: Share) => s.shareType === 'user') || []);
      }
    } catch (error) {
      console.error('Error fetching shares:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setEmailSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/shares?searchEmail=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setEmailSuggestions(data.users || []);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const createLinkShare = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, type: 'link', canEdit: false }),
      });
      if (response.ok) {
        const data = await response.json();
        setLinkShare(data.share);
      }
    } catch (error) {
      console.error('Error creating link share:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const shareWithUser = async () => {
    if (!email) return;
    setError('');
    setIsCreating(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, type: 'user', email, canEdit: false }),
      });
      if (response.ok) {
        const data = await response.json();
        setUserShares(prev => [...prev, data.share]);
        setEmail('');
        setEmailSuggestions([]);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to share');
      }
    } catch (error) {
      console.error('Error sharing with user:', error);
      setError('Failed to share');
    } finally {
      setIsCreating(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    try {
      const response = await fetch(`/api/shares?id=${shareId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (linkShare?.id === shareId) {
          setLinkShare(null);
        } else {
          setUserShares(prev => prev.filter(s => s.id !== shareId));
        }
      }
    } catch (error) {
      console.error('Error revoking share:', error);
    }
  };

  const copyLink = async () => {
    if (!linkShare?.shareToken) return;
    const url = `${window.location.origin}/shared/${linkShare.shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectSuggestion = (suggestion: { email: string }) => {
    setEmail(suggestion.email);
    setShowSuggestions(false);
    setEmailSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Share &quot;{fileName}&quot;</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Link sharing */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Share via link</h3>
              {linkShare ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/shared/${linkShare.shareToken}`}
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
                  />
                  <button
                    onClick={copyLink}
                    className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => revokeShare(linkShare.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove link"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={createLinkShare}
                  disabled={isCreating}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create shareable link'}
                </button>
              )}
            </div>

            {/* User sharing */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Share with people</h3>
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    onFocus={() => email.length >= 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Enter email address"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  />
                  <button
                    onClick={shareWithUser}
                    disabled={!email || isCreating}
                    className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    Share
                  </button>
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && emailSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    {emailSuggestions.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => selectSuggestion(user)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        <div className="text-gray-800">{user.email}</div>
                        {user.displayName && (
                          <div className="text-gray-500 text-xs">{user.displayName}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-red-500 text-sm mt-2">{error}</p>
              )}

              {/* Current user shares */}
              {userShares.length > 0 && (
                <div className="mt-4 space-y-2">
                  {userShares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm font-medium">
                            {share.sharedWithEmail?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <span className="text-sm text-gray-700">{share.sharedWithEmail}</span>
                      </div>
                      <button
                        onClick={() => revokeShare(share.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove access"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
