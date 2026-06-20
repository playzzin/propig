import type React from 'react';

export interface SiteHomeMetric {
  label: string;
  value: string;
  caption: string;
}

export interface SiteHomeLink {
  label: string;
  path: string;
  icon: string;
  description: string;
}

export interface SiteHomeSection {
  title: string;
  description: string;
  links: SiteHomeLink[];
}

export interface SiteHomePageProps {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  accentAlt: string;
  icon: string;
  metrics: SiteHomeMetric[];
  primaryLinks: SiteHomeLink[];
  sections: SiteHomeSection[];
}

const pageShellStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '28px',
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-bright)',
  fontSize: 'clamp(1.65rem, 2.4vw, 2.6rem)',
  fontWeight: 900,
  lineHeight: 1.08,
  letterSpacing: 0,
};

const mutedTextStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  lineHeight: 1.55,
};

export function SiteHomePage({
  eyebrow,
  title,
  description,
  accent,
  accentAlt,
  icon,
  metrics,
  primaryLinks,
  sections,
}: SiteHomePageProps) {
  return (
    <main id="content-area" style={pageShellStyle}>
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          borderRadius: 24,
          background: `linear-gradient(135deg, ${accent}24 0%, rgba(22, 27, 34, 0.94) 42%, ${accentAlt}18 100%)`,
          padding: '28px',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.28)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 'auto -80px -120px auto',
            width: 260,
            height: 260,
            borderRadius: 999,
            background: `radial-gradient(circle, ${accent}26 0%, transparent 68%)`,
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
            gap: 24,
            alignItems: 'end',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: accent,
                fontWeight: 900,
                fontSize: '0.78rem',
                marginBottom: 14,
              }}
            >
              <i className={`fa-solid fa-${icon}`} />
              <span>{eyebrow}</span>
            </div>
            <h1 style={heroTitleStyle}>{title}</h1>
            <p style={{ ...mutedTextStyle, maxWidth: 680, margin: '14px 0 0' }}>{description}</p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: 10,
            }}
          >
            {metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  minHeight: 112,
                  borderRadius: 18,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(10, 12, 16, 0.42)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 800 }}>
                  {metric.label}
                </span>
                <strong style={{ color: 'var(--text-bright)', fontSize: '1.35rem', fontWeight: 900 }}>
                  {metric.value}
                </strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.35 }}>
                  {metric.caption}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {primaryLinks.length > 0 && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 12,
            marginTop: 18,
          }}
        >
          {primaryLinks.map((link) => (
            <a
              key={link.path}
              href={link.path}
              style={{
                minHeight: 132,
                borderRadius: 18,
                border: '1px solid var(--border-subtle)',
                background: 'linear-gradient(180deg, rgba(31, 36, 45, 0.92), rgba(16, 20, 27, 0.96))',
                padding: 18,
                color: 'var(--text-main)',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: accent,
                  background: `${accent}18`,
                }}
              >
                <i className={`fa-solid fa-${link.icon}`} />
              </span>
              <span style={{ fontWeight: 900, color: 'var(--text-bright)' }}>{link.label}</span>
              <span style={{ ...mutedTextStyle, fontSize: '0.82rem', marginTop: 'auto' }}>
                {link.description}
              </span>
            </a>
          ))}
        </section>
      )}

      <section style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{
              borderRadius: 20,
              border: '1px solid var(--border-subtle)',
              background: 'rgba(22, 27, 34, 0.74)',
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--text-bright)', fontSize: '1rem', fontWeight: 900 }}>
                  {section.title}
                </h2>
                <p style={{ ...mutedTextStyle, margin: '5px 0 0', fontSize: '0.84rem' }}>
                  {section.description}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {section.links.map((link) => (
                <a
                  key={link.path}
                  href={link.path}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '34px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'center',
                    padding: '12px 13px',
                    borderRadius: 14,
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: 'var(--text-main)',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: accentAlt,
                      background: `${accentAlt}16`,
                    }}
                  >
                    <i className={`fa-solid fa-${link.icon}`} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', color: 'var(--text-bright)', fontSize: '0.88rem' }}>
                      {link.label}
                    </strong>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 3,
                        color: 'var(--text-muted)',
                        fontSize: '0.76rem',
                        lineHeight: 1.35,
                      }}
                    >
                      {link.description}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export function SiteSectionPage({
  title,
  description,
  accent,
  icon,
  items,
}: {
  title: string;
  description: string;
  accent: string;
  icon: string;
  items: string[];
}) {
  return (
    <main id="content-area" style={pageShellStyle}>
      <section
        style={{
          borderRadius: 24,
          border: '1px solid var(--border-subtle)',
          background: `linear-gradient(135deg, ${accent}20, rgba(22, 27, 34, 0.95))`,
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accent,
              background: `${accent}18`,
            }}
          >
            <i className={`fa-solid fa-${icon}`} />
          </span>
          <div>
            <h1 style={{ margin: 0, color: 'var(--text-bright)', fontSize: '1.8rem', fontWeight: 900 }}>{title}</h1>
            <p style={{ ...mutedTextStyle, margin: '7px 0 0' }}>{description}</p>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              borderRadius: 18,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              padding: 18,
              color: 'var(--text-main)',
              fontWeight: 800,
            }}
          >
            {item}
          </div>
        ))}
      </section>
    </main>
  );
}
