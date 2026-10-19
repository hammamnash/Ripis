import { Button, IconButton } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/*
 * A fixture, not a screen. Task 7.2's browser harness has to read `getComputedStyle` off real
 * components to prove §11's tokens reach them, and §7's screens do not exist until 7.4 — so this
 * page renders one of each and nothing else. It is deleted when the Dashboard lands.
 *
 * It is NOT in the app's navigation and carries `data-testid` hooks the harness keys on.
 */
export default function ComponentProbe() {
  return (
    <main data-testid="probe" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="btn-primary">Primary</Button>
        <Button data-testid="btn-ghost" variant="ghost">Ghost</Button>
        <Button data-testid="btn-destructive" variant="destructive">Delete</Button>
        <IconButton data-testid="btn-icon" aria-label="Icon">
          <span aria-hidden>+</span>
        </IconButton>
      </div>

      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-ash">Card body</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Label htmlFor="probe-input">Amount</Label>
        <Input id="probe-input" data-testid="input" defaultValue="1.250.000" />
      </div>

      <Tabs defaultValue="one">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
        <TabsContent value="two">Second</TabsContent>
      </Tabs>

      <Table data-testid="table">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-testid="table-row">
            <TableCell>19/10/2026</TableCell>
            <TableCell>Balance Difference</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <Skeleton data-testid="skeleton" className="h-4 w-32 rounded-input" />

      <Dialog>
        <DialogTrigger asChild>
          <Button data-testid="btn-dialog">Open</Button>
        </DialogTrigger>
        <DialogContent data-testid="dialog-content">
          <DialogTitle>Confirm</DialogTitle>
        </DialogContent>
      </Dialog>
    </main>
  )
}
