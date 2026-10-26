import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import fs from "node:fs/promises"
import path from "node:path"

export type EmailPreviewOptions = {
  /** Folder the e-mails are written to (created if missing). Default "./email-previews". */
  dir?: string
}

/**
 * A notification provider for development and tests: instead of sending an
 * e-mail it writes it to a folder, as `<time>-<template>-<to>.html` (open it
 * in a browser), `.txt`, `.json` (recipient, subject, data) and every
 * attachment. Never use it in production: nothing reaches the recipient.
 */
class EmailPreviewNotificationService extends AbstractNotificationProviderService {
  static identifier = "email-preview"

  protected dir_: string
  protected logger_: Logger

  static validateOptions(options: Record<string, unknown>) {
    if (options.dir !== undefined && (typeof options.dir !== "string" || !options.dir)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "email-preview: dir must be a folder path")
    }
  }

  constructor({ logger }: { logger: Logger }, options: EmailPreviewOptions = {}) {
    super()
    this.logger_ = logger
    this.dir_ = path.resolve(options.dir || "email-previews")
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    await fs.mkdir(this.dir_, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const slug = (value: string) => value.replace(/[^A-Za-z0-9@._-]+/g, "_").slice(0, 80)
    const base = path.join(this.dir_, `${stamp}-${slug(notification.template)}-${slug(notification.to)}`)
    const content = notification.content ?? {}
    const attachments: { filename: string; content_type: string | null; file: string }[] = []
    for (const [index, attachment] of (notification.attachments ?? []).entries()) {
      const file = `${base}-${index + 1}-${slug(attachment.filename)}`
      await fs.writeFile(file, Buffer.from(attachment.content, "base64"))
      attachments.push({ filename: attachment.filename, content_type: attachment.content_type ?? null, file: path.basename(file) })
    }
    if (content.html) {
      await fs.writeFile(`${base}.html`, content.html)
    }
    if (content.text) {
      await fs.writeFile(`${base}.txt`, content.text)
    }
    await fs.writeFile(
      `${base}.json`,
      JSON.stringify(
        {
          to: notification.to,
          from: notification.from ?? null,
          channel: notification.channel,
          template: notification.template,
          subject: content.subject ?? null,
          html: content.html ? `${path.basename(base)}.html` : null,
          attachments,
          data: notification.data ?? null,
        },
        null,
        2
      )
    )
    this.logger_.info(`email-preview: ${notification.template} to ${notification.to} -> ${base}.html`)
    return { id: path.basename(base) }
  }
}

export default EmailPreviewNotificationService
