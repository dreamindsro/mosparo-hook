/** The fields both example forms share. */
export function ContactFields() {
  return (
    <>
      <label>
        Name
        <input name="name" required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Message
        <textarea name="message" rows={4} required />
      </label>
      {/* mosparo does not read checkboxes; see `requiredFields` on the server. */}
      <label className="inline">
        <input name="newsletter" type="checkbox" />
        Send me the newsletter
      </label>
    </>
  );
}
