import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useAsync';
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '../lib/terms';

/**
 * ShopSmart Terms and Conditions. Describes how the shop actually works (see the code for each rule).
 * When this text changes, change TERMS_VERSION in lib/terms.ts and TERMS_VERSION on the server too.
 */
export default function Terms() {
  useDocumentTitle('Terms and Conditions');
  return (
    <div className="container section prose terms-page">
      <h1>Terms and Conditions</h1>
      <p className="muted">Version {TERMS_VERSION} · in force from {TERMS_EFFECTIVE_DATE}</p>

      <h2>1. About these terms</h2>
      <p>
        These terms apply when you create a ShopSmart account and buy from ShopSmart. By ticking the box at sign-up you
        agree to this version. How we use your personal data is explained separately in the privacy notice shown at
        sign-up and in <Link to="/account">Account → Privacy and consent</Link>.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Give accurate details and keep your password to yourself. You are responsible for orders placed from your account.</li>
        <li>After 5 wrong passwords in a row, sign-in is paused for 15 minutes to protect your account.</li>
        <li>You can delete your account at any time from your account page. Order records are kept as tax law requires.</li>
      </ul>

      <h2>3. Prices and orders</h2>
      <ul>
        <li>Prices are in Indian rupees and include GST. The price and stock are checked again when you place an order; if either changed, we tell you before the order is created.</li>
        <li>An order is confirmed only when you see the order confirmation page. Items are reserved for you from that moment.</li>
        <li>Any delivery charge is shown at checkout before you pay.</li>
      </ul>

      <h2>4. Payment</h2>
      <ul>
        <li>Online payments are handled by Razorpay. Card, UPI and bank details go to Razorpay, not to ShopSmart.</li>
        <li>An order is marked paid only after the payment is confirmed with Razorpay. An unpaid online order is cancelled if payment is not completed within the time shown on the order.</li>
        <li>Cash on delivery is paid when the order arrives.</li>
      </ul>

      <h2>5. Cancellations, returns and refunds</h2>
      <ul>
        <li>You can cancel an order until it ships.</li>
        <li>After delivery, you can request a return within the return window shown on your order.</li>
        <li>Refunds for online payments go back to the original payment method through Razorpay. Refunds for cash-on-delivery orders are arranged by our team.</li>
      </ul>

      <h2>6. Reviews</h2>
      <p>
        Reviews must be your honest experience of the product. Do not include other people's personal details, offensive
        content or advertising. We may remove reviews that break these rules. Your name is shown with your review.
      </p>

      <h2>7. Changes to these terms</h2>
      <p>
        If we change these terms, we publish the new text here with a new version number. We keep a record of which
        version you accepted and when.
      </p>

      <h2>8. Contact</h2>
      <p>Questions about an order or these terms: see <Link to="/help">Help</Link>.</p>
    </div>
  );
}
