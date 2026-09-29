import Image from "next/image";

export function InstagramLink() {
  return (
    <a className="instagram-link" href="https://www.instagram.com/el_solar_timbero/" target="_blank" rel="noopener noreferrer">
      <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></svg>
      <span>Follow us on Instagram<strong>@elsolartimbero <span aria-hidden="true"></span></strong></span>
    </a>
  );
}

export function EventDetails() {
  return (
    <div className="event-details">
      <div><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3M7 18h3" /></svg><p>Monday<time dateTime="2026-10-12">Oct 12, 2026</time></p></div>
      <div><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></svg><p>8–11:30 PM<span>New York time</span></p></div>
      <div><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><p>Guantanamera<span>939 8th Ave<br />New York, NY 10019</span></p></div>
    </div>
  );
}

export function ResultScreen({ kind }: { kind: "success" | "duplicate" }) {
  const success = kind === "success";
  return (
    <section className={`result-screen result-${kind}`} aria-labelledby="result-title">
      <Image className="result-palm result-palm-left" src="/artwork/palm-leaves-left.png" alt="" width={220} height={330} sizes="180px" />
      <Image className="result-palm result-palm-right" src="/artwork/palm-leaves-right.png" alt="" width={220} height={330} sizes="180px" />
      <div className="result-content">
        <p className="star-divider" aria-hidden="true">― ★ ―</p>
        <h1 id="result-title" tabIndex={-1} className="result-title" lang={success ? "es" : "en"}>
          {success ? <>¡Nos vemos<br /><span>en el Solar!</span></> : <>You’re already<br /><span>on the list!</span></>}
        </h1>
        <p className="result-lead">{success ? "Your RSVP has been confirmed." : "Looks like this phone number has already RSVP’d for this event."}</p>
        <p className="star-divider small" aria-hidden="true">― ★ ―</p>
        {success ? <p className="result-message">We’ve saved your RSVP and will share updates on Instagram. Guantanamera will handle any promotional e-gift-card communication separately. An RSVP does not guarantee a gift card.</p> : <><p className="result-script" lang="es">¡Nos vemos en el Solar!</p><p className="result-message">If you think this is a mistake, <a href="https://www.instagram.com/elsolartimbero/" target="_blank" rel="noopener noreferrer">contact us on Instagram</a>.</p></>}
        <div className="result-event">
          <h2>Cuban Night Social</h2>
          <p className="culture-line" lang="es">Música <span>★</span> Baile <span>★</span> Comunidad</p>
          <EventDetails />
          {/* A full navigation resets the in-page form state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="print-button result-button" href="/">{success ? "Back to home" : "View event"} <span aria-hidden="true">→</span></a>
        </div>
        <InstagramLink />
      </div>
      <div className="result-scenery" aria-hidden="true">
        <Image src="/artwork/homepage-capitol-street.png" alt="" fill sizes="(max-width: 1080px) 100vw, 1080px" className="result-street" />
        <Image src="/artwork/tumbadoras.png" alt="" width={250} height={300} sizes="(max-width: 640px) 130px, 230px" className="result-congas" />
        <Image src="/artwork/vintage-red-car.png" alt="" width={390} height={260} sizes="(max-width: 640px) 230px, 390px" className="result-car" />
      </div>
    </section>
  );
}
