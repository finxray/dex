# Components Directory

This directory contains all reusable React components for the Stoix web application, organized in a modular, Angular-like structure.

## Structure

Each component follows this pattern:
```
ComponentName/
├── ComponentName.tsx        # Component logic and JSX
└── ComponentName.module.css # Component-scoped styles
```

## Available Components

### Layout Components
- **Header/** - Main navigation header with mega menu and mobile menu
- **Footer/** - Site footer with copyright information

### Section Components
- **Hero/** - Landing page hero section
- **ProtocolSection/** - Protocol information section
- **TechnologySection/** - Technology stack section
- **ResourcesSection/** - Resources and documentation section
- **CompanySection/** - Company information section

## Importing Components

### Single Component
```tsx
import { Header } from "./components/Header/Header";
```

### Multiple Components (Recommended)
```tsx
import { Header, Footer, Hero } from "./components";
```

## Styling Strategy

### 1. CSS Modules (Component-Scoped)
Each component has an optional `.module.css` file for component-specific styles:
```tsx
import styles from "./Header.module.css";

<div className={styles.customClass}>...</div>
```

**Benefits:**
- Styles are scoped to the component (no naming conflicts)
- Similar to Angular's component styles
- Great for custom, reusable styles

### 2. Tailwind Classes (Global Utilities)
Used directly in className for rapid styling:
```tsx
<div className="flex items-center justify-between">...</div>
```

**Benefits:**
- Fast prototyping
- Consistent design system
- No need to write custom CSS for common patterns

### 3. Global Styles
App-wide styles are in `/src/app/globals.css`

## Best Practices

1. **Keep Components Focused**: Each component should have a single responsibility
2. **Props for Reusability**: Use props to make components configurable
3. **TypeScript**: Always define prop types using TypeScript interfaces
4. **Export from Index**: Add new components to `index.ts` for clean imports
5. **Client Components**: Use `"use client"` directive only when needed (state, events, etc.)

## Example: Creating a New Component

```bash
# 1. Create component directory
mkdir src/app/components/NewComponent

# 2. Create component file
touch src/app/components/NewComponent/NewComponent.tsx
touch src/app/components/NewComponent/NewComponent.module.css

# 3. Add to index.ts
echo 'export { NewComponent } from "./NewComponent/NewComponent";' >> src/app/components/index.ts
```

## Component Template

```tsx
import React from "react";
import styles from "./NewComponent.module.css";

interface NewComponentProps {
  title: string;
  description?: string;
}

export function NewComponent({ title, description }: NewComponentProps) {
  return (
    <div className={styles.container}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}
```

## Differences from Angular

| Feature | Angular | React (This Setup) |
|---------|---------|-------------------|
| Component File | `.component.ts` | `.tsx` |
| Styles | `.component.css` | `.module.css` |
| Template | `.component.html` | JSX in `.tsx` |
| Module System | `NgModule` | ES6 imports/exports |
| Scoped Styles | ViewEncapsulation | CSS Modules |
| Data Binding | Two-way `[(ngModel)]` | One-way + setState |

## Additional Resources

- [React Documentation](https://react.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [CSS Modules](https://github.com/css-modules/css-modules)
- [Tailwind CSS](https://tailwindcss.com/docs)

