import { useState } from 'react';
import { demoApi, type DemoSwitch } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog, ErrorState, Skeleton, Spinner } from '../components/ui';
import { dateTime } from '../lib/format';

const INFO: Record<string, { title: string; does: string; rule: string; evidence: string }> = {
  PII_IN_LOGS: {
    title: 'Personal data in application logs',
    does: 'Sign-up, failed sign-in, profile, address and order code paths write a debug line with fictional names, emails, phone numbers, addresses and Aadhaar-format numbers into the normal logs. Real customer data is never used.',
    rule: 'Security safeguards; purpose limitation (logs are not a purpose the customer agreed to).',
    evidence: 'authentication-service.log, customer-service.log, order-service.log',
  },
  OUT_OF_SCOPE_PROCESSING: {
    title: 'Processing beyond consent',
    does: 'Promotional campaigns skip the consent filter and message every customer, including those who only agreed to orders and delivery.',
    rule: 'Consent must be specific to a purpose (DPDP Act, section 6).',
    evidence: 'customer-service.log: marketing_message_sent consentStatus=absent purposeAllowed=false',
  },
  RETENTION_BYPASS: {
    title: 'Retention policy not applied',
    does: 'The erasure job finds accounts whose deletion is overdue and skips them, so their personal data stays in the database.',
    rule: 'Erase personal data once the purpose ends or consent is withdrawn (section 8(7)).',
    evidence: 'customer-service.log: retention_overdue disposalStatus=retained',
  },
  SCHEMA_DRIFT: {
    title: 'Unregistered personal-data column',
    does: 'Adds customers.alternate_mobile and copies phone numbers into it, outside the declared data inventory. Turning it off removes the column.',
    rule: 'Know and control where personal data is stored; reasonable security safeguards.',
    evidence: 'customer-service-db.log: ALTER TABLE, db_schema_change registered=false',
  },
};

export default function DemoViolations() {
  useDocumentTitle('Demo violations');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => demoApi.switches(), []);
  const [pending, setPending] = useState<DemoSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const apply = async (sw: DemoSwitch, enabled: boolean) => {
    setBusy(true);
    try {
      await demoApi.set(sw.name, enabled);
      setData((all) => (all ?? []).map((s) => (s.name === sw.name ? { ...s, enabled, updatedAt: new Date().toISOString() } : s)));
      toast.success(`${INFO[sw.name]?.title ?? sw.name} ${enabled ? 'turned on' : 'turned off'}`);
      setPending(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCampaign = async () => {
    setSending(true);
    try {
      const res = await demoApi.sendCampaign();
      toast.success(`Promotion ${res.campaignId} sent to ${res.recipients} customer${res.recipients === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stack">
      <div className="admin-head"><h1>Demo violations</h1><button className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button></div>
      <div className="demo-banner" role="note">
        Test controls for the GuardRail compliance agent. Each switch makes ShopSmart produce one kind of DPDP violation
        using synthetic data only. Every demo event is marked <code>demo=true</code> with its scenario, every change records
        which admin made it, and an answer key is written to <code>backend/logs/ground-truth/</code>. Turning a switch off
        stops new demo events immediately. Keep all switches off for normal use.
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton width="100%" height={260} /> : (
        <div className="demo-grid">
          {(data ?? []).map((sw) => {
            const info = INFO[sw.name];
            return (
              <article key={sw.name} className={`demo-card ${sw.enabled ? 'is-on' : ''}`}>
                <h3>
                  <span>{info?.title ?? sw.name}</span>
                  <label className="switch" title={sw.enabled ? 'Turn off' : 'Turn on'}>
                    <input type="checkbox" role="switch" aria-label={`${info?.title ?? sw.name}`} checked={sw.enabled} disabled={busy}
                      onChange={(e) => (e.target.checked ? setPending(sw) : apply(sw, false))} />
                    <span />
                  </label>
                </h3>
                <p>{info?.does}</p>
                <dl>
                  <dt>Rule</dt><dd>{info?.rule}</dd>
                  <dt>Shows up in</dt><dd><code>{info?.evidence}</code></dd>
                  <dt>Status</dt><dd>{sw.enabled ? 'On' : 'Off'}{sw.updatedAt ? `, since ${dateTime(sw.updatedAt)}` : ''}</dd>
                </dl>
                {sw.name === 'OUT_OF_SCOPE_PROCESSING' && (
                  <button className="btn btn-secondary btn-sm" onClick={sendCampaign} disabled={sending}>
                    {sending && <Spinner />} Send a promotion now
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        title="Turn this violation on?"
        message={pending ? `${INFO[pending.name]?.title}: ${INFO[pending.name]?.does}` : ''}
        confirmLabel="Turn on"
        tone="danger"
        busy={busy}
        onConfirm={() => pending && apply(pending, true)}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
