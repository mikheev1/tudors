import { z } from "zod";

export const bookingRequestSchema = z.object({
  name: z.string().min(2, "Введите имя"),
  phone: z.string().min(7, "Введите номер телефона"),
  telegram: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || /^@?[a-zA-Z0-9_]{5,32}$/.test(value), "Введите корректный Telegram"),
  date: z.string().min(1, "Выберите дату"),
  time: z.string().min(1, "Выберите время"),
  guests: z.coerce.number().int().min(1).max(5000),
  venue: z.string().min(1, "Выберите площадку"),
  hotspotLabel: z.string().optional(),
  comment: z.string().optional().default("")
});
