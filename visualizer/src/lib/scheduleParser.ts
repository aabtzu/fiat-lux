export interface Course {
  code: string;
  title: string;
  location: string;
  days: string[];
  startTime: string;
  endTime: string;
  color?: string;
}

export interface Schedule {
  courses: Course[];
}

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
];

const DAY_MAP: Record<string, string> = {
  'Mon': 'Monday',
  'Tue': 'Tuesday',
  'Wed': 'Wednesday',
  'Thu': 'Thursday',
  'Fri': 'Friday',
  'Sat': 'Saturday',
  'Sun': 'Sunday',
};

function parseTime(timeStr: string): string {
  // Convert "1:35 pm" to "13:35" format
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return timeStr;

  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = match[3].toLowerCase();

  if (period === 'pm' && hours !== 12) {
    hours += 12;
  } else if (period === 'am' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

function parseDaysAndTime(line: string): { days: string[]; startTime: string; endTime: string } | null {
  // Parse "Mon, Wed, Thu: 1:35 pm - 2:40 pm"
  const match = line.match(/^([A-Za-z,\s]+):\s*(.+?)\s*-\s*(.+)$/);
  if (!match) return null;

  const daysStr = match[1];
  const startTime = match[2];
  const endTime = match[3];

  const days = daysStr.split(',').map(d => {
    const trimmed = d.trim();
    return DAY_MAP[trimmed] || trimmed;
  });

  return {
    days,
    startTime: parseTime(startTime),
    endTime: parseTime(endTime),
  };
}

export function parseScheduleText(text: string): Schedule {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const courses: Course[] = [];

  let i = 0;
  let colorIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this looks like a course code (starts with letters followed by numbers)
    if (/^[A-Z]{2,5}\s*\d{4}/.test(line)) {
      const code = line;
      const title = lines[i + 1] || '';

      // Skip "Show more information" line if present
      let locationIndex = i + 2;
      if (lines[locationIndex] === 'Show more information') {
        locationIndex++;
      }

      const location = lines[locationIndex] || '';

      // Find the time line (contains am/pm)
      let timeIndex = locationIndex + 1;
      while (timeIndex < lines.length && !lines[timeIndex].includes('am') && !lines[timeIndex].includes('pm')) {
        timeIndex++;
      }

      if (timeIndex < lines.length) {
        const timeInfo = parseDaysAndTime(lines[timeIndex]);
        if (timeInfo) {
          courses.push({
            code,
            title,
            location,
            days: timeInfo.days,
            startTime: timeInfo.startTime,
            endTime: timeInfo.endTime,
            color: COLORS[colorIndex % COLORS.length],
          });
          colorIndex++;
        }
      }

      i = timeIndex + 1;
    } else {
      i++;
    }
  }

  return { courses };
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}
