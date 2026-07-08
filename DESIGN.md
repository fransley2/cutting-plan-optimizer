---
name: Industrial Intelligence System
colors:
  surface: '#faf9f6'
  surface-dim: '#dadad7'
  surface-bright: '#faf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f0'
  surface-container: '#eeeeeb'
  surface-container-high: '#e8e8e5'
  surface-container-highest: '#e3e3df'
  on-surface: '#1a1c1a'
  on-surface-variant: '#41484b'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f1f1ee'
  outline: '#71787b'
  outline-variant: '#c1c7cb'
  surface-tint: '#3d6472'
  primary: '#073543'
  on-primary: '#ffffff'
  primary-container: '#244c5a'
  on-primary-container: '#94bbcc'
  inverse-primary: '#a5cddd'
  secondary: '#8c5000'
  on-secondary: '#ffffff'
  secondary-container: '#fe9819'
  on-secondary-container: '#653800'
  tertiary: '#64082a'
  on-tertiary: '#ffffff'
  tertiary-container: '#82233f'
  on-tertiary-container: '#ff97ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c0e9fa'
  primary-fixed-dim: '#a5cddd'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#244c5a'
  secondary-fixed: '#ffdcbf'
  secondary-fixed-dim: '#ffb873'
  on-secondary-fixed: '#2d1600'
  on-secondary-fixed-variant: '#6a3b00'
  tertiary-fixed: '#ffd9df'
  tertiary-fixed-dim: '#ffb1c0'
  on-tertiary-fixed: '#3f0016'
  on-tertiary-fixed-variant: '#82223f'
  background: '#faf9f6'
  on-background: '#1a1c1a'
  surface-variant: '#e3e3df'
typography:
  display-lg:
    fontFamily: Arimo
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Arimo
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Arimo
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Arimo
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Arimo
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  display-lg-mobile:
    fontFamily: Arimo
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  container-max-width: 1440px
---

## Brand & Style

This design system is engineered for the high-stakes environment of offshore energy and industrial auditing. It adopts a **Corporate / Modern** aesthetic, specifically leveraging the Microsoft 365 and Power BI "Fluent" design language to ensure immediate familiarity for enterprise users. 

The visual narrative focuses on precision, reliability, and data density. It utilizes a clean, professional foundation to maximize legibility, while incorporating high-contrast industrial color accents that reflect the professional nature of engineering workflows. The interface prioritizes clarity and structured information over decorative flair, ensuring that audit-friendly data is always the primary focus. 

Key attributes:
- **Professionalism:** Aligned with global enterprise standards and technical reliability.
- **Precision:** Tight alignment and crisp borders reminiscent of technical drawings.
- **Efficiency:** Optimized for rapid data scanning and complex decision-making.

## Colors

The palette is anchored by **Deep Petrol**, providing a sophisticated, authoritative tone suitable for the energy sector. This is complemented by **Industrial Orange** for high-visibility secondary actions and **Burgundy** for tertiary accents, maintaining a high-contrast, technical atmosphere.

- **Primary Deep Petrol (#244C5A):** Used for headers, primary navigation, and high-priority call-to-actions.
- **Secondary Industrial Orange (#ED8B00):** Applied to supporting icons, warning-level indicators, and secondary buttons requiring attention.
- **Tertiary Burgundy (#8E2C48):** Used for specialized data categories or distinct UI accents.
- **Technical Red:** Strictly reserved for critical alerts, safety warnings, and out-of-tolerance data points.
- **Neutral Surface:** A cool light grey (#D9D9D6) provides a stable foundation for grouping panels and page backgrounds, offering a more industrial feel than pure white.

## Typography

The design system utilizes **Arimo** for both headlines and body text to provide a clear, neutral, and highly legible neo-grotesque appearance suitable for technical documentation. **Inter** is retained for labels and data-heavy content to ensure maximum legibility.

- **Headlines & Body:** Arimo provides a robust, professional framework. Headlines use semi-bold to bold weights to establish a clear hierarchy.
- **Body & Data:** Inter remains the workhorse for labels and data tables. A specific `data-tabular` role is defined for high-density grids to ensure numbers align perfectly for audit scanning.
- **Labels:** Small caps and increased letter spacing are used for metadata and column headers to distinguish them from content.

## Layout & Spacing

The layout is based on a **12-column fluid grid** for desktop, collapsing to 4 columns for mobile. It follows a 4px base-unit scaling system to ensure precise alignment of engineering data.

- **KPI Dashboards:** Utilize a standard Power BI layout with a fixed-width left-hand "Filter Panel" (280px) and a fluid main content area.
- **Audit Views:** Data density is high. Tables should utilize "Compact" spacing (8px cell padding) to minimize scrolling during review.
- **Breakpoints:**
  - Mobile: < 600px (Single column stacked).
  - Tablet: 600px - 1024px (Fluid grid with reduced margins).
  - Desktop: > 1024px (Full 12-column grid with standardized gutters).

## Elevation & Depth

This design system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows to maintain a clean, professional aesthetic.

- **Surface 0 (Background):** Neutral Grey (#D9D9D6).
- **Surface 1 (Cards):** White or Light Grey background with a 1px solid border (#C4C7C8).
- **Filtering Panels:** Used on a slightly darker neutral background to create a clear "workspace" vs. "navigation" distinction.
- **Active States:** Elements being edited or selected should use a primary color border (2px) rather than elevation change to signal focus.

## Shapes

The shape language is **Soft (0.25rem)**, adhering to the Fluent UI evolution of Microsoft 365. This subtle rounding provides a modern feel without sacrificing the structured, efficient look of an industrial tool.

- **Standard Elements:** Buttons, input fields, and small cards use 4px (0.25rem) corner radius.
- **Large Containers:** Dashboard cards or main content areas use 8px (0.5rem) to provide a softer frame for the technical data inside.
- **Data Markers:** Circular pips (pill-shaped) are used for status indicators within tables to provide a visual break from the rectangular grid.

## Components

### Buttons & Inputs
- **Primary Action:** Deep Petrol background with white text, 4px border radius.
- **Secondary Action:** Industrial Orange background or border for high-visibility secondary actions.
- **Editable Fields:** Background uses a light tint. When focused, the border transitions to the primary Deep Petrol with a 2px stroke.

### KPI Cards
- Inspired by Power BI: Large bold value (Arimo) at the top, a small descriptive label below, and a subtle sparkline or trend indicator at the bottom.
- Use Industrial Orange for "Warning" trends and Technical Red for "Critical" audit findings.

### Data Tables
- Header cells: Neutral background (#D9D9D6), bold labels, and clear sort icons.
- Row hover: Subtle tint to help eye-tracking across long rows.
- Status Chips: Small, rounded capsules using semantic colors (Petrol for pass, Orange for warning, Technical Red for fail).

### Filtering Panels
- Located on the left or in a top-bar. 
- Multi-select checkboxes and date pickers must use high contrast, clear focus states, and minimalist icons.

### Audit Checklist
- Interactive list items with large hit areas for checkboxes.
- Supporting documentation attachments should be represented by small icons in secondary Industrial Orange or Petrol.