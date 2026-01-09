'use client';

import { Course, timeToMinutes, minutesToTime } from '@/lib/scheduleParser';

interface WeeklyCalendarProps {
  courses: Course[];
  title?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const START_HOUR = 8; // 8 AM
const END_HOUR = 18; // 6 PM
const HOUR_HEIGHT = 60; // pixels per hour

export default function WeeklyCalendar({ courses, title }: WeeklyCalendarProps) {
  const startMinutes = START_HOUR * 60;
  const endMinutes = END_HOUR * 60;
  const totalMinutes = endMinutes - startMinutes;
  const totalHeight = (totalMinutes / 60) * HOUR_HEIGHT;

  const hours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    hours.push(h);
  }

  const getEventStyle = (course: Course) => {
    const startMins = timeToMinutes(course.startTime);
    const endMins = timeToMinutes(course.endTime);

    const top = ((startMins - startMinutes) / 60) * HOUR_HEIGHT;
    const height = ((endMins - startMins) / 60) * HOUR_HEIGHT;

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };

  const getCoursesByDay = (day: string) => {
    return courses.filter((course) => course.days.includes(day));
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {title && (
        <div className="bg-gray-800 text-white px-6 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
      )}

      <div className="flex">
        {/* Time column */}
        <div className="w-20 flex-shrink-0 bg-gray-50 border-r border-gray-200">
          <div className="h-12 border-b border-gray-200"></div>
          <div className="relative" style={{ height: `${totalHeight}px` }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-2 text-sm text-gray-500 -translate-y-2"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                {minutesToTime(hour * 60)}
              </div>
            ))}
          </div>
        </div>

        {/* Days columns */}
        <div className="flex-1 grid grid-cols-5">
          {DAYS.map((day) => (
            <div key={day} className="border-r border-gray-200 last:border-r-0">
              {/* Day header */}
              <div className="h-12 border-b border-gray-200 flex items-center justify-center bg-gray-50">
                <span className="font-medium text-gray-700">{day}</span>
              </div>

              {/* Time slots */}
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-gray-100"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Course events */}
                {getCoursesByDay(day).map((course, idx) => {
                  const startMins = timeToMinutes(course.startTime);
                  const endMins = timeToMinutes(course.endTime);
                  const durationMins = endMins - startMins;
                  const isShort = durationMins <= 60;

                  return (
                    <div
                      key={`${course.code}-${idx}`}
                      className={`absolute left-1 right-1 ${course.color} text-white rounded-md p-1.5 overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer`}
                      style={getEventStyle(course)}
                    >
                      <div className={`font-semibold leading-tight ${isShort ? 'text-xs' : 'text-sm'}`}>
                        {course.code}
                      </div>
                      <div className={`opacity-90 leading-tight break-words ${isShort ? 'text-[10px]' : 'text-xs'}`}>
                        {course.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Courses</h3>
        <div className="flex flex-wrap gap-3">
          {courses.map((course) => (
            <div key={course.code} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${course.color}`}></div>
              <span className="text-sm text-gray-600">
                {course.code}: {course.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
