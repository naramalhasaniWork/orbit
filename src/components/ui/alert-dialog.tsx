"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Confirmation for destructive or irreversible actions (delete project, revoke key,
 * remove member, cancel runs). Built on the Dialog primitive with role="alertdialog":
 * it cannot be dismissed by clicking outside, Escape cancels, and focus starts on Cancel.
 * (Swap for @radix-ui/react-alert-dialog when the dependency is added; the API matches.)
 */
const AlertDialog = Dialog
const AlertDialogTrigger = DialogTrigger
const AlertDialogHeader = DialogHeader
const AlertDialogFooter = DialogFooter
const AlertDialogTitle = DialogTitle
const AlertDialogDescription = DialogDescription

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, onPointerDownOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      role="alertdialog"
      onPointerDownOutside={(e) => {
        e.preventDefault()
        onPointerDownOutside?.(e)
      }}
      className={cn(
        "fixed left-[50%] top-[50%] z-modal grid w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:duration-open data-[state=closed]:duration-[168ms] data-[state=closed]:ease-in",
        className
      )}
      {...props}
    />
  </DialogPortal>
))
AlertDialogContent.displayName = "AlertDialogContent"

/** Rendered before the action, so it receives initial focus. */
const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props}
  />
))
AlertDialogCancel.displayName = "AlertDialogCancel"

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(buttonVariants({ variant: "destructive" }), className)}
    {...props}
  />
))
AlertDialogAction.displayName = "AlertDialogAction"

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
}
