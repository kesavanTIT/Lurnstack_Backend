const getDurationSeconds = (attendance, occurrence) => {
  if (!attendance) return 0;
  
  let dynamicTotalSeconds = 0;
  const events = attendance.events || [];
  
  if (events.length > 0) {
    dynamicTotalSeconds = events.reduce((sum, event) => {
      let joinedAt = event.joinedAt;
      let leftAt = event.leftAt;
      
      if (joinedAt) {
        if (!leftAt) {
          let calcEnd = new Date();
          
          // Heartbeat timeout check: 3 minutes
          const lastActiveTime = event.updatedAt ? new Date(event.updatedAt) : new Date(event.joinedAt);
          if (calcEnd.getTime() - lastActiveTime.getTime() > 3 * 60 * 1000) {
            calcEnd = lastActiveTime;
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
          return sum + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
        }
      }
      return sum;
    }, 0);
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

  // Fallback to static stored totalDurationSeconds if calculated is lower
  return Math.max(attendance.totalDurationSeconds || 0, dynamicTotalSeconds);
};

module.exports = {
  getDurationSeconds
};
