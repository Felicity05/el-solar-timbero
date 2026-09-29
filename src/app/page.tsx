import Image from "next/image";
import RsvpExperience from "./rsvp-form";
import { EventDetails, InstagramLink, ResultScreen } from "./poster";

export default function Home() {
  return (
    <div className="poster-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        {/* A full navigation also resets the in-page RSVP result. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" aria-label="El Solar Timbero home" className="brand-logo">
          <Image src="/artwork/el-solar-logo-transparent.png" alt="El Solar Timbero — música, baile, comunidad" width={180} height={180} sizes="(max-width: 640px) 112px, 156px" priority />
        </a>
        <p className="brand-motto" lang="es"><span aria-hidden="true">★</span> Más que un placer,<br />un solar.</p>
        <a className="header-instagram" href="https://www.instagram.com/elsolartimbero/" target="_blank" rel="noopener noreferrer">Follow the rhythm <span aria-hidden="true">↗</span></a>
      </header>
      <main id="main">
        <RsvpExperience
          hero={
            <section className="event-hero" aria-labelledby="event-title">
              <div className="hero-scene" aria-hidden="true">
                <Image src="/artwork/homepage-capitol-street.png" alt="" fill priority sizes="(max-width: 1080px) 100vw, 1080px" className="scene-background" />
                <Image src="/artwork/vintage-red-car.png" alt="" width={550} height={367} sizes="(max-width: 640px) 180px, 350px" className="scene-car" />
                <Image src="/artwork/cuban-dance-couple.png" alt="" width={380} height={570} sizes="(max-width: 640px) 210px, 350px" className="scene-dancers" priority />
              </div>
              <div className="hero-copy">
                <p className="eyebrow"><span aria-hidden="true">★</span> Próximo evento <span aria-hidden="true">★</span></p>
                <h1 id="event-title" className="event-title"><span>Cuban</span><br />Night Social</h1>
                <p className="hero-tagline" lang="es">Timba, son y lo mejor de la música cubana</p>
                <p className="culture-line" lang="es">Música <span>★</span> Baile <span>★</span> Comunidad</p>
                <EventDetails />
                <p className="admission">Entrada: <strong>FREE.99</strong> <span>· Free admission</span></p>
              </div>
            </section>
          }
          aside={
            <aside className="form-aside" aria-label="Cuban music and community">
              <div className="conga-poster">
                <p lang="es">La música<br /><em>vive aquí.</em></p>
                <Image src="/artwork/tumbadoras.png" alt="" width={320} height={360} sizes="300px" />
              </div>
              <p className="aside-culture" lang="es">★ Música cubana<br />★ Baile<br />★ Comunidad<br />★ Cultura<br />★ Siempre</p>
            </aside>
          }
          success={<ResultScreen kind="success" />}
          duplicate={<ResultScreen kind="duplicate" />}
        />
      </main>
      <footer className="site-footer">
        <div><p className="footer-brand">El Solar Timbero</p><p lang="es">Más que un placer, un solar.</p></div>
        <InstagramLink />
        <p className="footer-bottom">New York, NY <span aria-hidden="true">★</span> Música · Baile · Comunidad</p>
      </footer>
    </div>
  );
}
