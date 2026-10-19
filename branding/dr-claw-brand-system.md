# Dr. Claw Development Brand System

**Status:** Shared brand standard  
**Scope:** Dr. Claw Development and its software product family  
**Principle:** Shared visual DNA, distinct product identity.

## 1. Brand identity

Dr. Claw Development produces individual software products with a recognizable family identity. Each product must have its own name, symbol, application icon and product-specific UI while inheriting the parent brand's visual language.

The creative direction draws inspiration from 1980s animated spy adventures, retro supervillain command centers and the theatrical atmosphere of the original *Inspector Gadget* era. This is stylistic inspiration, not permission to copy the show's characters, artwork, lettering or logos.

**Personality:** technical, controlled, theatrical, slightly sinister and playful.

**Required characteristics:**
- Dark, high-contrast visuals
- Bold angular or subtly forward-slanted geometry
- Dramatic silhouettes and thoughtful negative space
- Industrial or metallic details used selectively
- References to claws, secret laboratories, machinery and control consoles where relevant
- Modern and usable interfaces with restrained retro-futuristic details

The theme must remain recognizable without literal cartoon illustrations.

## 2. Shared color foundation

| Role | HEX | Usage |
|---|---|---|
| Villain Red | `#E10606` | Signature identity and selected emphasis |
| Shadow Black | `#0B0B0B` | Main dark canvas |
| Charcoal | `#111111` | Main interface surfaces |
| Steel Gray | `#4A4A4A` | Structural details and secondary treatments |
| Metallic Silver | `#8F959C` | Highlights and metallic identity details |
| Highlight White | `#EDEDED` | Primary text and high-contrast elements |

These are shared reference colors. Product-specific systems can add intermediate surfaces, muted text, border colors and accessible semantic states. One restrained secondary accent color is permitted when it supports the product's function or recognition.

**Red is not a default color for every button.** Use it for meaningful emphasis. Keep error, destructive, active, selected and progress states distinguishable by both color and non-color cues. Verify accessible contrast.

## 3. Typography and form

- Use legible modern sans-serif typography for application UI.
- Use bold, angular or subtly forward-slanted lettering selectively in wordmarks and brand-level headlines.
- Favor strong geometric shapes, clear silhouettes and consistent icon stroke weight.
- Make logos and icons recognizable at the smallest actual distribution size.
- Build clean, original SVG source assets. Avoid embedded raster images or dependence on unavailable fonts.
- Use metallic effects sparingly. Avoid decorative gradients that weaken small-icon clarity.

No universal font family, radius scale, spacing scale or animation timing was fixed by the original branding prompt. Define those in each product's `design.md` while preserving family resemblance.

## 4. Parent brand, product identity and UI

### Parent brand: Dr. Claw Development
Owns the shared palette, personality, creative principles, geometric character and publisher identity.

### Product brand
Owns the unique name, logo, icon, wordmark and product-specific visual metaphor. A product may use claws, retro equipment, machinery, angular monograms or a metaphor based on its own purpose. Do not force a cat mascot, a claw shape or the same symbol on every application.

### Application UI
Owns usable layouts, component styling and workflows appropriate to its platform. Adapt the family system to existing technology. Functional clarity takes priority over decorative branding.

**Existing examples:** Clawdio and Margin illustrate the family system, but their product-specific marks, accent distribution and UI choices do not automatically become universal rules.

## 5. Icon and logo requirements

Each product needs:
- One recognizable original primary application symbol
- A wordmark or product name treatment where useful
- Light, dark and monochrome variants as required
- Transparent-background vector source files
- An optically simplified small-size icon if scaling alone is insufficient
- Exports sized for its actual operating system, browser extension manifest, mobile platform or web application

Do not recolor or directly reuse another product's icon. Do not copy protected *Inspector Gadget* art or logos. Maintain recognizable family traits through visual rhythm, geometry, contrast and palette.

## 6. Interface design principles

1. Dark-mode-first, not dark-mode-only when the product requires another appearance.
2. Minimalist, practical layouts that support the core task.
3. High contrast, readable text and clear focus states.
4. Strong geometric structure and consistent icon proportions.
5. Limited decorative animation; respect reduced-motion preferences.
6. Red used selectively for significant states and identity.
7. Platform conventions and accessibility take precedence over visual novelty.
8. Keep data processing, controls and error states clear without relying only on color.

Apply the system through semantic tokens rather than scattered hardcoded values. Different frameworks may use CSS variables, Tailwind tokens or native component styles.

## 7. Product-specific latitude

The following are **not** mandatory family-wide rules:
- The Clawdio black-cat mark
- The Margin Redline document mark
- A particular UI framework or component library
- A universal UI layout
- All-black interfaces if they reduce accessibility
- A specific animation or special effect
- An identical wordmark for every product

A new product can introduce one restrained supporting color or a new metaphor while using the parent palette and geometry as its foundation.

## 8. Approval and quality controls

Before final production:
- Study the product's workflows, source code, requirements and existing design decisions.
- Explore multiple genuinely different visual concepts.
- Compare product relevance, family consistency, small-size recognition, originality and implementation practicality.
- Obtain explicit selection of the product concept.
- Perform two review passes: first identify problems, then challenge and confirm them.

Before delivery:
- Validate exact icon dimensions and required platform formats.
- Ensure SVG source files contain vector artwork rather than raster placeholders.
- Verify all referenced exported assets exist.
- Check color contrast, small-icon recognition and state clarity.
- Document family-inherited and product-specific elements separately.
- Keep the branding implementation isolated from unrelated working behavior.

## 9. Required documentation for each product

Each product's `design.md` should define:
- Brand concept and family relationship
- Logo and icon usage
- Full semantic color tokens
- Typography
- Spacing, layout, borders and radii
- Components and interaction states
- Motion, accessibility and platform requirements
- Correct and incorrect usage
- Actual asset paths and export formats

A completed branding package should include clean source vectors, necessary icon exports, tokens, relevant mockups and a code-agent implementation prompt. No placeholder asset may be presented as completed work.

## 10. Source precedence

When working on another Dr. Claw Development product:
1. **This document** is authoritative for the shared parent identity.
2. **Approved product-specific designs** control that product's unique identity.
3. **Existing applications such as Clawdio and Margin** are examples, not universal rules.
4. **The target application's actual requirements, source code and platform conventions** control technical implementation.
5. New creative proposals must respect the above constraints.

**Success criterion:** Related applications are identifiable as independent products from Dr. Claw Development without becoming visually interchangeable.

---

*Extracted and reorganized from the recovered “Dr. Claw Development: Product Branding System” reusable prompt (October 12, 2026). Product-discovery steps and instructions to an AI designer were separated from the durable shared brand rules. No finished parent-brand logo or universal component-scale specification was present in the recovered source.*
