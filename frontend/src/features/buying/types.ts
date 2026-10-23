export type ReplayActions = {
  decisionDate: string | null;
  onDecisionDateChange: (date: string) => void;
  selectedHour: number;
  onHourChange: (hour: number) => void;
  onReviewAccuracy: () => void;
  onInspect: (target: string) => void;
};
