const fs = require("fs");

const targetFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\components\\DashboardSectionRenderer.jsx";

const content = `import TrainerAttendancePage from "../../pages/TrainerAttendancePage";
import TrainerPaymentsSection from "../../payments/components/TrainerPaymentsSection";
import CreateSessionSection from "../sections/CreateSessionSection";
import DashboardOverviewSection from "../sections/DashboardOverviewSection";
import RecurringSessionsSection from "../sections/RecurringSessionsSection";
import TridinCurriculumSection from "../sections/TridinCurriculumSection";
import MyProfilePage from "../../pages/MyProfilePage";

export default function DashboardSectionRenderer({ activeTab, activePaymentView, data, handlers }) {
  if (activeTab === "create") {
    return (
      <CreateSessionSection
        form={data.form}
        formErrors={data.formErrors}
        message={data.message}
        error={data.error}
        editingSessionId={data.editingSessionId}
        loadingCourses={data.loadingCourses}
        submitting={data.submitting}
        trainerActionsLocked={data.trainerActionsLocked}
        courseTitleSuggestions={data.courseTitleSuggestions}
        combinedCategorySuggestions={data.combinedCategorySuggestions}
        fieldClass={handlers.fieldClass}
        onSubmit={handlers.handleSubmit}
        onCancelEditing={handlers.cancelEditing}
        onChange={handlers.handleChange}
        onCourseTitleChange={handlers.handleCourseTitleChange}
        onThumbnailChange={handlers.handleThumbnailChange}
      />
    );
  }
  if (activeTab === "sessions") {
    return (
      <RecurringSessionsSection
        sessions={data.sessions}
        message={data.message}
        error={data.error}
        loadingSessions={data.loadingSessions}
        trainerActionsLocked={data.trainerActionsLocked}
        actionId={data.actionId}
        onNavigate={handlers.goTo}
        onRefresh={() => handlers.loadSessions()}
        onEditSession={handlers.startEditingSession}
        onUpdateSessionAction={handlers.updateSessionAction}
        onOpenSessionDialog={handlers.openSessionDialog}
      />
    );
  }
  if (activeTab === "tridin-videos") {
    return <TridinCurriculumSection />;
  }
  if (activeTab === "attendance") {
    return (
      <section>
        <TrainerAttendancePage embedded />
      </section>
    );
  }
  if (activeTab === "earnings") {
    return <TrainerPaymentsSection activeView={activePaymentView} isTrainerActive={data.isTrainerActive} />;
  }
  if (activeTab === "profile") {
    return <MyProfilePage />;
  }
  return (
    <DashboardOverviewSection
      courses={data.courses}
      sessions={data.sessions}
      loadingCourses={data.loadingCourses}
      loadingSessions={data.loadingSessions}
      todaysCancelledCount={data.todaysCancelledCount}
      nextSession={data.nextSession}
      trainerActionsLocked={data.trainerActionsLocked}
      onNavigate={handlers.goTo}
    />
  );
}
`;

fs.writeFileSync(targetFile, content, "utf8");
console.log("Successfully updated DashboardSectionRenderer.jsx");
