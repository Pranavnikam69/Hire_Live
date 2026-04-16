import useMeetingActions from "@/hooks/useMeetingActions";
import { Doc } from "../../convex/_generated/dataModel";
import { getMeetingStatus } from "@/lib/utils";
import { format, isValid } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { CalendarIcon, TrashIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import toast from "react-hot-toast";
import { useUserRole } from "@/hooks/useUserRole";

type Interview = Doc<"interviews">;

function MeetingCard({ interview }: { interview: Interview }) {
  const { joinMeeting } = useMeetingActions();
  const { isInterviewer } = useUserRole();
  const deleteInterview = useMutation(api.interviews.deleteInterview);

  const status = getMeetingStatus(interview);
  const startTime = new Date(interview.startTime);
  const formattedDate = isValid(startTime)
    ? format(startTime, "EEEE, MMMM d · h:mm a")
    : "Invalid Date";

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this meeting?")) return;

    try {
      await deleteInterview({ id: interview._id });
      toast.success("Meeting cancelled");
    } catch (error) {
      console.error(error);
      toast.error("Failed to cancel meeting");
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            {formattedDate}
          </div>

          <Badge
            variant={
              status === "live" ? "default" : status === "upcoming" ? "secondary" : "outline"
            }
          >
            {status === "live" ? "Live Now" : status === "upcoming" ? "Upcoming" : "Completed"}
          </Badge>
        </div>

        <CardTitle>{interview.title}</CardTitle>

        {interview.description && (
          <CardDescription className="line-clamp-2">{interview.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {status === "live" && (
          <Button className="w-full" onClick={() => joinMeeting(interview.streamCallId)}>
            Join Meeting
          </Button>
        )}

        {status === "upcoming" && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled>
              Waiting to Start
            </Button>
            {isInterviewer && (
              <Button variant="destructive" size="icon" onClick={handleCancel}>
                <TrashIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export default MeetingCard;
