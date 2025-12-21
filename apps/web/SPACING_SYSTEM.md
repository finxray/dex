# Spacing System - Best Practices

This document explains the spacing system used to ensure consistent padding and spacing across dynamic UI elements.

## Problem

When elements dynamically appear/disappear (exchange rate, error messages, buttons), inconsistent padding can cause:
- Double padding when elements stack
- Missing padding when elements are adjacent
- Layout shifts and visual inconsistencies

## Solution

We use two components: `SpacedSection` and `SpacedItem` to ensure consistent spacing.

## Components

### SpacedSection

Use for containers with multiple children that need spacing between them.

```tsx
<SpacedSection spacing="normal">
  {error && <ErrorMsg />}
  {needsApproval && <ApproveButton />}
  <SwapButton />
</SpacedSection>
```

**Props:**
- `spacing`: "none" | "tight" | "normal" | "loose" (default: "normal")
- `hasTopPadding`: Add top padding (default: false)
- `hasBottomPadding`: Add bottom padding (default: false)
- `className`: Additional classes

### SpacedItem

Use for single elements that need consistent horizontal padding.

```tsx
<SpacedItem hasTopMargin hasBottomMargin>
  <ExchangeRateCard />
</SpacedItem>
```

**Props:**
- `hasTopMargin`: Add top margin (default: false)
- `hasBottomMargin`: Add bottom margin (default: false)
- `className`: Additional classes

## Standard Padding

All spacing components use consistent horizontal padding:
- Mobile: `px-[15px]` (15px)
- Desktop: `px-4` (16px)

This matches the padding used in the "You pay" and "You receive" cards.

## Spacing Levels

- **"none"**: No spacing between children
- **"tight"**: `space-y-2` (8px) - for error messages, small items
- **"normal"**: `space-y-3` (12px) - default, for most content
- **"loose"**: `space-y-4` (16px) - for larger sections

## Rules

1. ✅ **DO**: Use SpacedSection for multiple dynamic elements
2. ✅ **DO**: Use SpacedItem for single elements needing padding
3. ✅ **DO**: Use hasTopMargin/hasBottomMargin when you need extra spacing
4. ❌ **DON'T**: Add padding classes directly to elements inside SpacedSection/SpacedItem
5. ❌ **DON'T**: Use custom padding classes like `px-0 md:px-4` - use the spacing components instead

## Examples

### ✅ Good - Multiple dynamic elements

```tsx
<SpacedSection spacing="tight">
  {quoteError && <ErrorMsg />}
  {allowanceError && <ErrorMsg />}
  {connectError && <ErrorMsg />}
</SpacedSection>
```

### ✅ Good - Single element

```tsx
<SpacedItem>
  <ExchangeRateCard />
</SpacedItem>
```

### ✅ Good - Element with extra spacing

```tsx
<SpacedItem hasTopMargin hasBottomMargin>
  <ApproveButton />
</SpacedItem>
```

### ❌ Bad - Double padding

```tsx
<SpacedItem>
  <div className="px-4">Content</div>  // Don't add padding inside SpacedItem
</SpacedItem>
```

### ❌ Bad - Inconsistent padding

```tsx
<div className="px-0 md:px-4">  // Don't use custom padding
  <Content />
</div>
```

## Implementation in Swap Page

The swap page uses this system for:
- Exchange rate display
- Error messages container
- Network mismatch warning
- Approve button
- Wallet connection error
- Swap button container

All these elements now have consistent padding and spacing, preventing double padding or missing padding when they appear/disappear.

