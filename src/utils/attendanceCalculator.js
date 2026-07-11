const getDurationSeconds = (attendance, occurrence) => {
  if (!attendance) return 0;
  
  let dynamicTotalSeconds = 0;
  const events = attendance.events || [];
  
  if (events.length > 0) {
    dynamicTotalSeconds = events.reduce((sum, event) => {
      let joinedAt = event.joinedAt;
      let leftAt = event.leftAt;
      
      if (joinedAt) {
        let calcEnd = leftAt ? new Date(leftAt) : new Date();
        
        if (!leftAt) {
          // Heartbeat timeout check: 3 minutes
          const lastActiveTime = event.updatedAt ? new Date(event.updatedAt) : new Date(event.joinedAt);
          if (calcEnd.getTime() - lastActiveTime.getTime() > 3 * 60 * 1000) {
            calcEnd = lastActiveTime;
          }
        }
        
        // ALWAYS cap at occurrence endsAt if applicable
        if (occurrence?.endsAt && calcEnd > new Date(occurrence.endsAt)) {
          calcEnd = new Date(occurrence.endsAt);
        }
        
        const start = new Date(joinedAt);
        const end = new Date(calcEnd);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
          return sum + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
        }
      }
      return sum;
    }, 0);
    return dynamicTotalSeconds;
  } else {
    // If no events tracked yet, try to infer from single Attendance record
    let joinedAt = attendance.firstJoinedAt || attendance.joinedAt;
    let leftAt = attendance.lastJoinedAt;

    if (joinedAt) {
      if (!leftAt) {
        let calcEnd = new Date();
        const lastActiveTime = attendance.updatedAt || joinedAt;
        if (calcEnd.getTime() - new Date(lastActiveTime).getTime() > 3 * 60 * 1000) {
          calcEnd = new Date(lastActiveTime);
        }
        
        // CRITICAL FIX: ALWAYS cap at occurrence endsAt if applicable
        if (occurrence?.endsAt && calcEnd > new Date(occurrence.endsAt)) {
          calcEnd = new Date(occurrence.endsAt);
        }
        
        leftAt = calcEnd;
      }
      const start = new Date(joinedAt);
      const end = new Date(leftAt);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
        dynamicTotalSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
      }
    }
  }

  // Fallback to static stored totalDurationSeconds if no events are tracked (capped at max class length)
  let storedSeconds = attendance.totalDurationSeconds || 0;
  if (occurrence?.endsAt && occurrence?.startsAt) {
    const maxPossible = Math.ceil((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 1000);
    if (storedSeconds > maxPossible) {
      storedSeconds = maxPossible;
    }
  }
  return storedSeconds;
};

module.exports = {
  getDurationSeconds
};
