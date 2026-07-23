"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  disabled = false,
  pendingLabel = "Saving…",
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}
