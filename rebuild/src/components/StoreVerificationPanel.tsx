import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, AlertTriangle, Clock, Phone, Mail, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { VerificationRequest, LocationDetail } from '../types';
import { Dialog, FormField } from './Dialog';

interface StoreVerificationPanelProps {
  location: LocationDetail;
  onVerified: () => void;
}

export function StoreVerificationPanel({ location, onVerified }: StoreVerificationPanelProps) {
  const { authUser } = useAuth();
  const [pendingRequest, setPendingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResponseForm, setShowResponseForm] = useState(false);

  const fetchPendingRequest = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/app/verification/pending/for-store');
      if (response.ok) {
        const { data } = await response.json();
        setPendingRequest(data);
      }
    } catch (err) {
      console.error('Failed to fetch pending verification:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.role === 'Store') {
      fetchPendingRequest();
    } else {
      setLoading(false);
    }
  }, [authUser, fetchPendingRequest]);

  if (loading) {
    return null;
  }

  if (!pendingRequest) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-yellow-800">Verification Request</h3>
          <p className="text-sm text-yellow-700 mt-1">
            Please verify that your store hours and contact information are correct.
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            Expires {new Date(pendingRequest.expiresAt).toLocaleDateString()}
          </p>
          <button
            onClick={() => setShowResponseForm(true)}
            className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700"
          >
            Respond to Request
          </button>
        </div>
      </div>

      {showResponseForm && (
        <VerificationResponseForm
          request={pendingRequest}
          location={location}
          onClose={() => setShowResponseForm(false)}
          onSubmitted={() => {
            setShowResponseForm(false);
            setPendingRequest(null);
            onVerified();
          }}
        />
      )}
    </div>
  );
}

interface VerificationResponseFormProps {
  request: VerificationRequest;
  location: LocationDetail;
  onClose: () => void;
  onSubmitted: () => void;
}

function VerificationResponseForm({ request, location, onClose, onSubmitted }: VerificationResponseFormProps) {
  const [hoursCorrect, setHoursCorrect] = useState<boolean | null>(null);
  const [proposedPhone, setProposedPhone] = useState('');
  const [proposedEmail, setProposedEmail] = useState('');
  const [showPhoneEdit, setShowPhoneEdit] = useState(false);
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async () => {
    if (hoursCorrect === null) {
      setError('Please confirm whether the hours are correct');
      return;
    }

    setSubmitting(true);
    setError(null);

    const proposedChanges: Record<string, unknown> = {};
    if (proposedPhone && proposedPhone !== location.mainPhone) {
      proposedChanges.mainPhone = proposedPhone;
    }
    if (proposedEmail && proposedEmail !== location.sharedInboxEmail) {
      proposedChanges.sharedInboxEmail = proposedEmail;
    }

    try {
      const response = await apiFetch(`/api/app/verification/${request.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursConfirmed: hoursCorrect,
          proposedChanges: Object.keys(proposedChanges).length > 0 ? proposedChanges : null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to submit response');
        return;
      }

      onSubmitted();
    } catch {
      setError('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const dialogFooter = (
    <button
      onClick={handleSubmit}
      disabled={submitting || hoursCorrect === null}
      className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
    >
      {submitting ? 'Submitting...' : 'Submit Response'}
    </button>
  );

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title="Verify Store Information"
      footer={dialogFooter}
      size="lg"
      triggerRef={triggerRef}
    >
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2" role="alert">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <fieldset>
          <legend className="font-medium text-gray-900 mb-3">Are the store hours correct?</legend>
          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm" aria-label="Current store hours">
            {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map(day => (
              <div key={day} className="flex justify-between py-1">
                <span className="capitalize text-gray-600">{day}</span>
                <span className="text-gray-900">
                  {!location.standardHours?.[day] || location.standardHours[day].closed 
                    ? 'Closed' 
                    : (location.standardHours[day].intervals ?? []).map(i => `${i.open}-${i.close}`).join(', ') || 'Not set'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-3" role="radiogroup" aria-label="Hours verification">
            <button
              onClick={() => setHoursCorrect(true)}
              role="radio"
              aria-checked={hoursCorrect === true}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 min-h-[44px] ${
                hoursCorrect === true 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <CheckCircle className="w-5 h-5" aria-hidden="true" />
              Hours are correct
            </button>
            <button
              onClick={() => setHoursCorrect(false)}
              role="radio"
              aria-checked={hoursCorrect === false}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 min-h-[44px] ${
                hoursCorrect === false 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Edit2 className="w-5 h-5" aria-hidden="true" />
              Need correction
            </button>
          </div>
          {hoursCorrect === false && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-800 font-medium">
                Hours need updating?
              </p>
              <p className="text-sm text-orange-700 mt-1">
                After submitting this response, you'll be able to submit a correction request with your proposed hours changes.
              </p>
            </div>
          )}
        </fieldset>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="font-medium text-gray-900 mb-3">Contact Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg min-h-[44px]">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <span className="text-gray-700">{location.phoneFormatted}</span>
              </div>
              <button
                onClick={() => {
                  setShowPhoneEdit(!showPhoneEdit);
                  if (!showPhoneEdit) setProposedPhone(location.mainPhone);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 min-h-[44px] px-2"
              >
                {showPhoneEdit ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {showPhoneEdit && (
              <FormField id="verify-phone" label="Correct phone number">
                <input
                  id="verify-phone"
                  type="tel"
                  value={proposedPhone}
                  onChange={(e) => setProposedPhone(e.target.value)}
                  placeholder="Enter correct phone number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </FormField>
            )}

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg min-h-[44px]">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <span className="text-gray-700">{location.sharedInboxEmail || '(none)'}</span>
              </div>
              <button
                onClick={() => {
                  setShowEmailEdit(!showEmailEdit);
                  if (!showEmailEdit) setProposedEmail(location.sharedInboxEmail || '');
                }}
                className="text-sm text-blue-600 hover:text-blue-800 min-h-[44px] px-2"
              >
                {showEmailEdit ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {showEmailEdit && (
              <FormField id="verify-email" label="Correct email address">
                <input
                  id="verify-email"
                  type="email"
                  value={proposedEmail}
                  onChange={(e) => setProposedEmail(e.target.value)}
                  placeholder="Enter correct email address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </FormField>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
