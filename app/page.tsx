/* Native <picture> elements switch between the supplied mobile and desktop crops. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Logo, socialIcons } from "./icons";
import { SiteNav } from "./site-nav";
import { challengeUrl, siteName } from "./site";

type Crop = { mobile: string; desktop: string; alt: string; mobileSize: [number, number]; desktopSize: [number, number] };

function Picture({ crop, className, priority }: { crop: Crop; className?: string; priority?: boolean }) {
  return (
    <picture className={className}>
      <source media="(min-width: 48rem)" srcSet={`/images/desktop/${crop.desktop}`} width={crop.desktopSize[0]} height={crop.desktopSize[1]} />
      <img src={`/images/mobile/${crop.mobile}`} width={crop.mobileSize[0]} height={crop.mobileSize[1]} alt={crop.alt} loading={priority ? "eager" : "lazy"} decoding="async" />
    </picture>
  );
}

const features = [
  {
    id: "about",
    title: "Transform your brand",
    body: "We are a full-service creative agency specializing in helping brands grow fast. Engage your clients through compelling visuals that do most of the marketing for you.",
    link: "#services",
    accent: "yellow",
    crop: { mobile: "image-transform.jpg", desktop: "image-transform.jpg", alt: "A white egg casting a long shadow on a yellow background", mobileSize: [750, 624], desktopSize: [720, 600] },
  },
  {
    id: "stand-out",
    title: "Stand out to the right audience",
    body: "Using a collaborative formula of designers, researchers, photographers, videographers, and copywriters, we’ll build and extend your brand in digital places.",
    link: "#testimonials",
    accent: "red",
    crop: { mobile: "image-stand-out.jpg", desktop: "image-stand-out.jpg", alt: "A pink cup on a stem against a coral background", mobileSize: [750, 624], desktopSize: [720, 600] },
  },
] satisfies Array<{ id: string; title: string; body: string; link: string; accent: string; crop: Crop }>;

const services = [
  { id: "graphic-design", title: "Graphic Design", body: "Great design makes you memorable. We deliver artwork that underscores your brand message and captures potential clients’ attention." },
  { id: "photography", title: "Photography", body: "Increase your credibility by getting the most stunning, high-quality photos that improve your business image." },
];

const testimonials = [
  { name: "Emily R.", role: "Marketing Director", photo: "image-emily.jpg", quote: "We put our trust in Sunnyside and they delivered, making sure our needs were met and deadlines were always hit." },
  { name: "Thomas S.", role: "Chief Operating Officer", photo: "image-thomas.jpg", quote: "Sunnyside’s enthusiasm coupled with their keen interest in our brand’s success made it a satisfying and enjoyable experience." },
  { name: "Jennie F.", role: "Business Owner", photo: "image-jennie.jpg", quote: "Incredible end result! Our sales increased over 400% when we worked with Sunnyside. Highly recommended!" },
];

const gallery: Crop[] = [
  { mobile: "image-gallery-milkbottles.jpg", desktop: "image-gallery-milkbottles.jpg", alt: "Three milk bottles with red caps under a cloud", mobileSize: [376, 376], desktopSize: [720, 894] },
  { mobile: "image-gallery-orange.jpg", desktop: "image-gallery-orange.jpg", alt: "Half an orange on a white plate in a teal bowl", mobileSize: [376, 376], desktopSize: [720, 894] },
  { mobile: "image-gallery-cone.jpg", desktop: "image-gallery-cone.jpg", alt: "An empty ice cream cone on a blue background", mobileSize: [376, 376], desktopSize: [720, 894] },
  { mobile: "image-gallery-sugar-cubes.jpg", desktop: "image-gallery-sugarcubes.jpg", alt: "A tower of sugar cubes on a pink background", mobileSize: [376, 376], desktopSize: [720, 894] },
];

const footerLinks = [
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#projects", label: "Projects" },
];

export default function Home() {
  return (
    <>
      <header className="hero">
        <div className="topbar">
          <Link className="brand" href="/" aria-label="Sunnyside home"><Logo className="logo" /></Link>
          <SiteNav />
        </div>
        <h1>We are creatives</h1>
        <a className="scroll-cue" href="#about">
          <img src="/images/icon-arrow-down.svg" width="36" height="114" alt="" />
          <span className="sr-only">Skip to Transform your brand</span>
        </a>
      </header>

      <main>
        {features.map(feature => (
          <section key={feature.id} id={feature.id} className={`feature feature-${feature.id}`} aria-labelledby={`${feature.id}-title`}>
            <Picture crop={feature.crop} className="feature-image" priority={feature.id === "about"} />
            <div className="feature-copy">
              <h2 id={`${feature.id}-title`}>{feature.title}</h2>
              <p>{feature.body}</p>
              <a className={`learn-more learn-more-${feature.accent}`} href={feature.link} aria-describedby={`${feature.id}-title`}>Learn more</a>
            </div>
          </section>
        ))}

        <section id="services" className="services" aria-labelledby="services-title">
          <h2 id="services-title" className="sr-only">Services</h2>
          {services.map(service => (
            <article key={service.id} className={`service service-${service.id}`} aria-labelledby={`${service.id}-title`}>
              <h3 id={`${service.id}-title`}>{service.title}</h3>
              <p>{service.body}</p>
            </article>
          ))}
        </section>

        <section id="testimonials" className="testimonials" aria-labelledby="testimonials-title">
          <h2 id="testimonials-title">Client testimonials</h2>
          <ul className="testimonial-list">
            {testimonials.map(item => (
              <li key={item.name}>
                <figure className="testimonial">
                  <img src={`/images/${item.photo}`} width="72" height="72" alt={`Portrait of ${item.name}`} loading="lazy" />
                  <blockquote><p>{item.quote}</p></blockquote>
                  <figcaption><span className="testimonial-name">{item.name}</span><span className="testimonial-role">{item.role}</span></figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section id="projects" className="gallery" aria-labelledby="projects-title">
          <h2 id="projects-title" className="sr-only">Projects</h2>
          <ul>
            {gallery.map(item => <li key={item.desktop}><Picture crop={item} /></li>)}
          </ul>
        </section>
      </main>

      <footer id="contact" className="site-footer">
        <Logo className="footer-logo" />
        <nav aria-label="Footer">
          <ul className="footer-links">
            {footerLinks.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}
          </ul>
        </nav>
        <ul className="socials" aria-label="Social media">
          {socialIcons.map(icon => (
            <li key={icon.name}>
              <a href={icon.href} aria-label={icon.name}>
                <svg viewBox={`0 0 ${icon.width} ${icon.height}`} width={icon.width} height={icon.height} aria-hidden="true" focusable="false"><path d={icon.d} fill="currentColor" /></svg>
              </a>
            </li>
          ))}
        </ul>
        <p className="attribution"><span className="site-name">{siteName}</span>. Challenge by <a href={challengeUrl}>Frontend Mentor</a>. Built by <a href="https://royeradames.com">Royer Adames</a>.</p>
      </footer>
    </>
  );
}
