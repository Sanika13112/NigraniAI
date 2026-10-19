import { useState, type FormEvent } from 'react';
import type { Address, AddressInput } from '../lib/types';
import { Field, Spinner } from './ui';

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

type Errors = Partial<Record<keyof AddressInput, string>>;

export function validateAddress(a: AddressInput): Errors {
  const e: Errors = {};
  if (!a.fullName.trim()) e.fullName = 'Enter the recipient’s name';
  if (!/^[6-9]\d{9}$/.test(a.phone.trim())) e.phone = 'Enter a valid 10-digit mobile number';
  if (!a.line1.trim()) e.line1 = 'Enter house number and street';
  if (!a.city.trim()) e.city = 'Enter the city';
  if (!a.state) e.state = 'Choose a state';
  if (!/^[1-9]\d{5}$/.test(a.pincode.trim())) e.pincode = 'Enter a valid 6-digit PIN code';
  return e;
}

export function AddressForm({ initial, onSubmit, onCancel, submitLabel = 'Save address', serverError }: {
  initial?: Address | null;
  onSubmit: (value: AddressInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  serverError?: string | null;
}) {
  const [value, setValue] = useState<AddressInput>({
    label: initial?.label ?? '',
    fullName: initial?.fullName ?? '',
    phone: initial?.phone ?? '',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    pincode: initial?.pincode ?? '',
    makeDefault: initial?.defaultAddress ?? false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof AddressInput) => (e: { target: { value: string } }) => setValue((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateAddress(value);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({ ...value, fullName: value.fullName.trim(), phone: value.phone.trim(), pincode: value.pincode.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      {serverError && <div className="form-error" role="alert">{serverError}</div>}
      <Field label="Full name" htmlFor="a-name" error={errors.fullName}>
        <input id="a-name" value={value.fullName} onChange={set('fullName')} autoComplete="name" maxLength={100} />
      </Field>
      <Field label="Mobile number" htmlFor="a-phone" error={errors.phone}>
        <input id="a-phone" value={value.phone} onChange={set('phone')} inputMode="numeric" autoComplete="tel-national" maxLength={10} />
      </Field>
      <Field label="House no., building, street" htmlFor="a-line1" error={errors.line1}>
        <input id="a-line1" value={value.line1} onChange={set('line1')} autoComplete="address-line1" maxLength={200} />
      </Field>
      <Field label="Area, landmark (optional)" htmlFor="a-line2">
        <input id="a-line2" value={value.line2 ?? ''} onChange={set('line2')} autoComplete="address-line2" maxLength={200} />
      </Field>
      <div className="form-row">
        <Field label="City" htmlFor="a-city" error={errors.city}>
          <input id="a-city" value={value.city} onChange={set('city')} autoComplete="address-level2" maxLength={80} />
        </Field>
        <Field label="PIN code" htmlFor="a-pin" error={errors.pincode}>
          <input id="a-pin" value={value.pincode} onChange={set('pincode')} inputMode="numeric" autoComplete="postal-code" maxLength={6} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="State" htmlFor="a-state" error={errors.state}>
          <select id="a-state" value={value.state} onChange={set('state')} autoComplete="address-level1">
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Label (optional)" htmlFor="a-label" hint="e.g. Home, Office">
          <input id="a-label" value={value.label ?? ''} onChange={set('label')} maxLength={30} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!value.makeDefault} onChange={(e) => setValue((v) => ({ ...v, makeDefault: e.target.checked }))} />
        Make this my default address
      </label>
      <div className="form-actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Spinner />} {submitLabel}</button>
      </div>
    </form>
  );
}

export function AddressBlock({ a }: { a: Pick<Address, 'fullName' | 'phone' | 'line1' | 'line2' | 'city' | 'state' | 'pincode'> }) {
  return (
    <address className="address-block">
      <strong>{a.fullName}</strong>
      <span>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</span>
      <span>{a.city}, {a.state} {a.pincode}</span>
      <span>Phone: {a.phone}</span>
    </address>
  );
}
