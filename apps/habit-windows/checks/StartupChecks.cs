using ProPig.Habits;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;

internal static class StartupChecks
{
    internal static void Run()
    {
        if (!WidgetStartup.IsActivation(["--startup-widgets"]) || WidgetStartup.IsActivation([]) ||
            WidgetStartup.IsActivation(["propig-widgets:clock"]) || WidgetStartup.IsActivation(["propig-widgets:--startup-widgets"]) ||
            WidgetStartup.IsActivation(["--startup-widgets", "market"]))
            throw new InvalidOperationException("Only the exact packaged startup arguments may start widget restoration.");
        if (!WidgetStartup.IsRegisteredTask(ActivationKind.StartupTask, "ProPigWidgetsStartup") ||
            WidgetStartup.IsRegisteredTask(ActivationKind.Launch, "ProPigWidgetsStartup") ||
            WidgetStartup.IsRegisteredTask(ActivationKind.StartupTask, "OtherTask") ||
            WidgetStartup.IsWidgetStartup([], packaged: false))
            throw new InvalidOperationException("Only this package's Windows startup activation should hide the dashboard.");

        void Expect(StartupTaskState state, bool enable, WidgetStartup.Change expected)
        {
            if (WidgetStartup.RequestedChange(state, enable) != expected)
                throw new InvalidOperationException($"Unexpected startup change for Windows state {state}, requested enable={enable}.");
        }

        Expect(StartupTaskState.Disabled, true, WidgetStartup.Change.Enable);
        Expect(StartupTaskState.Enabled, false, WidgetStartup.Change.Disable);
        Expect(StartupTaskState.Enabled, true, WidgetStartup.Change.None);
        Expect(StartupTaskState.Disabled, false, WidgetStartup.Change.None);
        Expect(StartupTaskState.DisabledByUser, true, WidgetStartup.Change.WindowsSettings);
        Expect(StartupTaskState.DisabledByUser, false, WidgetStartup.Change.None);
        foreach (var policy in new[] { StartupTaskState.DisabledByPolicy, StartupTaskState.EnabledByPolicy })
        {
            Expect(policy, true, WidgetStartup.Change.None);
            Expect(policy, false, WidgetStartup.Change.None);
        }
    }
}
