export type Plant = {
  id: string;
  name: string;
  intervalDays: number;
  photo: string;
  lastWateredOn: string | null;
};

export type Watering = {
  id: string;
  wateredOn: string;
  memberId: string;
  memberName: string;
};

function utcDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function addCalendarDays(iso: string, days: number): string {
  return new Date(utcDay(iso) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function daysUntil(today: string, due: string): number {
  return Math.round((utcDay(due) - utcDay(today)) / (24 * 60 * 60 * 1000));
}

export function needsWater(plant: Pick<Plant, "lastWateredOn" | "intervalDays">, today: string): boolean {
  if (!plant.lastWateredOn) return true;
  return daysUntil(today, addCalendarDays(plant.lastWateredOn, plant.intervalDays)) <= 0;
}

export function wateringLabel(plant: Pick<Plant, "lastWateredOn" | "intervalDays">, today: string): string {
  if (!plant.lastWateredOn) return "Not watered yet";
  const remaining = daysUntil(today, addCalendarDays(plant.lastWateredOn, plant.intervalDays));
  if (remaining > 1) return `Water in ${remaining} days`;
  if (remaining === 1) return "Water in 1 day";
  if (remaining === 0) return "Water today";
  const late = -remaining;
  return late === 1 ? "Overdue by 1 day" : `Overdue by ${late} days`;
}

export function compressPlantPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.width, image.height);
      const scale = longest > 800 ? 800 / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that photo."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let quality = 0.7;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 520_000 && quality > 0.45) {
        quality -= 0.1;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    image.src = url;
  });
}
