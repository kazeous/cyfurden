"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  ACCOUNT_DISPLAY_NAME_MAX_INPUT,
  validateAccountDisplayName,
  type AccountDisplayNameError,
} from "@/lib/account-profile";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

export type ProfileFormStrings = {
  displayNameLabel: string;
  displayNameHelp: string;
  saveName: string;
  savingName: string;
  nameSaved: string;
  nameRequired: string;
  nameLength: string;
  nameTooLong: string;
  nameSaveFailed: string;
};

function validationMessage(
  error: AccountDisplayNameError | null,
  strings: ProfileFormStrings,
) {
  if (error === "required") return strings.nameRequired;
  if (error === "length") return strings.nameLength;
  if (error === "too-long") return strings.nameTooLong;
  return "";
}

export function ProfileForm({
  initialName,
  strings,
}: {
  initialName: string;
  strings: ProfileFormStrings;
}) {
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const statusId = useId();
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [serverMessage, setServerMessage] = useState("");
  const validation = validateAccountDisplayName(name);
  const clientError =
    touched && !validation.ok
      ? validationMessage(validation.error, strings)
      : "";
  const message = clientError || serverMessage;
  const messageTone = clientError ? "error" : status;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setServerMessage("");
    setStatus("idle");
    const result = validateAccountDisplayName(name);
    if (!result.ok) return;

    setPending(true);
    try {
      const response = await authClient.updateUser({ name: result.value });
      if (response.error) {
        setStatus("error");
        setServerMessage(strings.nameSaveFailed);
        return;
      }
      setName(result.value);
      setStatus("success");
      setServerMessage(strings.nameSaved);
      router.refresh();
    } catch {
      setStatus("error");
      setServerMessage(strings.nameSaveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.profileForm} noValidate onSubmit={handleSubmit}>
      <label className={styles.field} htmlFor={inputId}>
        <span>{strings.displayNameLabel}</span>
        <input
          aria-describedby={`${helpId} ${statusId}`}
          aria-invalid={messageTone === "error" || undefined}
          autoComplete="name"
          data-state={messageTone === "error" ? "error" : undefined}
          disabled={pending}
          id={inputId}
          maxLength={ACCOUNT_DISPLAY_NAME_MAX_INPUT}
          name="name"
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            setName(event.target.value);
            setServerMessage("");
            setStatus("idle");
          }}
          required
          type="text"
          value={name}
        />
      </label>
      <p className={styles.fieldHelp} id={helpId}>
        {strings.displayNameHelp}
      </p>
      <div className={styles.formFooter}>
        <button
          className={styles.primaryButton}
          data-loading={pending || undefined}
          disabled={pending}
          type="submit"
        >
          {pending ? strings.savingName : strings.saveName}
        </button>
        <p
          className={styles.formStatus}
          data-status={messageTone}
          id={statusId}
          role={messageTone === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      </div>
    </form>
  );
}
