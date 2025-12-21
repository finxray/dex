"use client";

import { ReactNode } from "react";

/**
 * SPACING SYSTEM - Best Practices
 * 
 * This spacing system ensures consistent padding and spacing across dynamic UI elements
 * without creating double padding or missing padding when elements appear/disappear.
 * 
 * RULES:
 * 1. Use SpacedSection for containers with multiple children that need spacing between them
 * 2. Use SpacedItem for single elements that need consistent padding
 * 3. Never add padding classes directly to elements inside SpacedSection/SpacedItem
 * 4. Use hasTopMargin/hasBottomMargin only when you need extra spacing (e.g., after a card)
 * 5. Standard horizontal padding: px-[15px] md:px-4 (matches card padding)
 * 
 * SPACING LEVELS:
 * - "none": No spacing between children (use for single items)
 * - "tight": space-y-2 (for error messages, small items)
 * - "normal": space-y-3 (default, for most content)
 * - "loose": space-y-4 (for larger sections)
 * 
 * EXAMPLES:
 * 
 * ✅ GOOD - Multiple dynamic elements:
 * <SpacedSection spacing="normal">
 *   {error && <ErrorMsg />}
 *   {needsApproval && <ApproveButton />}
 *   <SwapButton />
 * </SpacedSection>
 * 
 * ✅ GOOD - Single element with consistent padding:
 * <SpacedItem>
 *   <ExchangeRateCard />
 * </SpacedItem>
 * 
 * ❌ BAD - Double padding:
 * <SpacedItem>
 *   <div className="px-4">Content</div>  // Don't add padding inside SpacedItem
 * </SpacedItem>
 * 
 * ❌ BAD - Inconsistent padding:
 * <div className="px-0 md:px-4">  // Don't use custom padding
 *   <Content />
 * </div>
 */

/**
 * SpacedSection - A component that ensures consistent spacing between dynamic elements
 * 
 * This component provides:
 * - Consistent horizontal padding (matches card padding)
 * - Proper vertical spacing between elements without doubling
 * - Handles conditional rendering without creating gaps
 * 
 * Usage:
 * <SpacedSection spacing="normal">
 *   <ExchangeRate />
 *   <ErrorMessages />
 *   <ApproveButton />
 * </SpacedSection>
 */
interface SpacedSectionProps {
  children: ReactNode;
  /** Add top padding (default: false) */
  hasTopPadding?: boolean;
  /** Add bottom padding (default: false) */
  hasBottomPadding?: boolean;
  /** Custom spacing between children (default: "normal") */
  spacing?: "none" | "tight" | "normal" | "loose";
  /** Additional className */
  className?: string;
}

const SPACING_MAP = {
  none: "",
  tight: "space-y-2",
  normal: "space-y-3",
  loose: "space-y-4",
};

export function SpacedSection({
  children,
  hasTopPadding = false,
  hasBottomPadding = false,
  spacing = "normal",
  className = "",
}: SpacedSectionProps) {
  // Standard horizontal padding that matches card padding
  const horizontalPadding = "px-[15px] md:px-4";
  
  // Vertical padding classes
  const topPadding = hasTopPadding ? "pt-4" : "";
  const bottomPadding = hasBottomPadding ? "pb-4" : "";
  
  // Spacing between children
  const spacingClass = SPACING_MAP[spacing];
  
  return (
    <div
      className={`${horizontalPadding} ${topPadding} ${bottomPadding} ${spacingClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * SpacedItem - Wrapper for individual items that should have consistent spacing
 * 
 * Use this when you need to wrap a single element with consistent padding
 * but don't want to create a container with spacing between children.
 */
interface SpacedItemProps {
  children: ReactNode;
  /** Add top margin (default: false) */
  hasTopMargin?: boolean;
  /** Add bottom margin (default: false) */
  hasBottomMargin?: boolean;
  /** Additional className */
  className?: string;
}

export function SpacedItem({
  children,
  hasTopMargin = false,
  hasBottomMargin = false,
  className = "",
}: SpacedItemProps) {
  const horizontalPadding = "px-[15px] md:px-4";
  const topMargin = hasTopMargin ? "mt-4" : "";
  const bottomMargin = hasBottomMargin ? "mb-4" : "";
  
  return (
    <div
      className={`${horizontalPadding} ${topMargin} ${bottomMargin} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

