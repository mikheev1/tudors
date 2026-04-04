import type { HotspotBookingStatus, ProcessFeedback } from "@/lib/types";

const BOOKING_SLA_MINUTES = 10;
const BOOKING_HOLD_MINUTES = 30;
const WAITLIST_SLA_HOURS = 2;

export function getProcessHint(status?: HotspotBookingStatus) {
  if (status === "waitlist") {
    return "Лист ожидания: уведомим первым при отмене или освобождении слота.";
  }

  return "Мгновенная заявка: подтверждаем слот, связываемся и фиксируем hold без ухода со страницы.";
}

export function buildBookingFeedback(
  venueName: string,
  hotspotLabel: string,
  bookingDate?: string,
  bookingTime?: string
): ProcessFeedback {
  const slotLabel = [bookingDate, bookingTime].filter(Boolean).join(" ");

  return {
    status: "hold_pending",
    message: `Заявка по ${hotspotLabel} в ${venueName}${slotLabel ? ` на ${slotLabel}` : ""} принята.`,
    nextAction: "Менеджер подтверждает слот и отправляет ссылку на предоплату или финальное подтверждение.",
    slaLabel: `SLA ответа: до ${BOOKING_SLA_MINUTES} минут`,
    holdLabel: `Hold слота: ${BOOKING_HOLD_MINUTES} минут`
  };
}

export function buildWaitlistFeedback(venueName: string, hotspotLabel: string): ProcessFeedback {
  return {
    status: "waitlist_joined",
    message: `Вы добавлены в waitlist по ${hotspotLabel} в ${venueName}.`,
    nextAction: "Как только слот освобождается, система поднимает заявку и отправляет уведомление.",
    slaLabel: `Проверка очереди: каждые ${WAITLIST_SLA_HOURS} часа`
  };
}
