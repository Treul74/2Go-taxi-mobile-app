2GO Navigation Engine Bible
Version 1.0
Vision

Build a world-class navigation system that feels as smooth as Google Maps, as driver-friendly as Yango, and as intelligent as Uber while remaining fully reusable across the application.

There should never again be different navigation implementations.

Instead everything must use

NavigationEngine
Core Principles

The Navigation Engine owns everything related to navigation.

It becomes responsible for

camera
map rotation
zoom
pitch
route
ETA
turn instructions
rerouting
GPS
navigation states
HUD
animation
auto fitting
marker movement

No individual screen should ever call

animateCamera()

fitToCoordinates()

watchPositionAsync()

getDirections()

directly.

Instead screens simply say

<NavigationMap
    mode="pickup"
/>

and the engine does everything.

Navigation Modes

The engine has eight modes.

Idle

↓

Preview

↓

Searching Driver

↓

Driver Accepted

↓

Navigate To Pickup

↓

Waiting At Pickup

↓

Trip In Progress

↓

Near Destination

↓

Completed

Every one of these modes has

camera

buttons

bottom sheet

route

zoom

pitch

padding

HUD

Camera Profiles

Instead of random

animateCamera()

calls,

the engine exposes reusable profiles.

Preview

Purpose

Customer selects pickup and destination.

Automatically fit

Pickup

↓

Destination

↓

Entire route

inside the map.

Vehicle rotation

OFF

Map rotation

OFF

Pitch

0°

Bearing

North

Searching Driver

Shows

pickup

destination

nearby drivers

Everything remains visible.

Driver Accepted

Camera slowly transitions

towards

driver

pickup

instead of instantly jumping.

Navigate To Pickup

This is Image 1.

Vehicle arrow

fixed

68%

down the screen.

Road moves.

Camera rotates.

North stays aligned to the navigation arrow.

Pitch

50°

Zoom

17.5

Bearing

Driver heading

Animation

Smooth

Waiting At Pickup

Vehicle stops.

Camera zooms

slightly closer.

Customer pin becomes focus.

Slide

Arrive

appears.

Trip In Progress

This is the most important mode.

Exactly like

Google Maps

Yango

Uber.

Vehicle

always

faces north.

Road rotates underneath.

Driver arrow

never moves.

Everything moves around it.

Turn banner

top left.

ETA

top right.

Speed

bottom left.

Collapsed trip card

bottom.

Near Destination

Zoom

slightly out.

Destination highlighted.

Arrival countdown.

Completed

Zoom

out.

Show both

vehicle

destination.

Bottom sheet expands.

Camera Follow

The driver should never chase the camera.

The camera follows the driver.

Vehicle position

          Road

            ↑

            ↑

            ↑

            ↑

     Vehicle

Vehicle should stay around

65–70%

down the screen.

Never centered.

Camera follows

NOT

the current GPS.

Instead

predict

future movement.

GPS

↓

Prediction

↓

Camera

↓

Animation

This removes shaking.

Auto Rotation

Exactly like Image 1.

Driver arrow

always

faces north.

Road rotates.

Not the arrow.

Meaning

Arrow

↑

always

Road

rotates underneath.

This is much easier to read.

Automatic Route Fit

Image 2.

Whenever pickup and destination exist

Automatically compute

North

South

East

West

bounds.

Then include

Safe Area

Top cards

Bottom sheet

Floating buttons

Map controls

Status bar

Navigation banner

Then fit everything.

The user should always see

Driver

Pickup

Destination

Entire route

without manually zooming.

Turn-by-Turn Navigation

Image 3.

Top left

Small turn icon.

Below

250 m

Turn Right

Second instruction

(optional)

Then Left

Never make this card larger than necessary.

Dynamic Zoom

Walking

18.5

City driving

17.5

Highway

16

Very fast

15

Automatic.

Pitch

Preview

0°

Driving

45–55°

Arrival

35°

Completed

0°

Route Engine

The engine owns routing.

Screens never fetch routes.

NavigationEngine

↓

Google Directions

↓

Polyline

↓

Traffic

↓

ETA

↓

Distance
Rerouting

Do NOT request a route every second.

Instead

Driver

↓

Moved

30 meters?

↓

No

Ignore

↓

Yes

Check route

↓

Off route?

↓

Yes

Fetch

↓

No

Keep current route

This dramatically reduces API usage.

Navigation HUD

Exactly like your latest UI.

Top Left

Turn icon

Distance

Instruction

Top Right

Clock

ETA

Location

Remaining distance

Bottom Left

Current speed

Speed limit

Right Side

Layers

Compass

Center

Zoom

Bottom

Collapsed card

Distance

Arrival

Duration

↓

Slide

Complete Trip

Bottom Sheet Behaviour

Collapsed

Distance

Arrival

Duration

Expanded

Customer

Pickup

Destination

Payment

Support

Trip details

Exactly like the UI you designed.

Marker System

Every marker uses

useAnimatedMarker()

Vehicle

Customer

Pickup

Dropoff

Navigation arrow

All use identical interpolation.

GPS Engine

One GPS watcher.

Never

five.

Profiles

Planning

Balanced

Driver

Best Navigation

Customer

Balanced

Background

Low Power

Navigation Store

One global store.

navigationStore

cameraMode

route

steps

ETA

distance

remaining

speed

bearing

zoom

pitch

activeInstruction

activeStep

navigationState

driverLocation

pickup

destination

No screen owns these values.

Navigation Components

Everything becomes reusable.

NavigationEngine/

NavigationMap

CameraController

RouteEngine

NavigationStore

NavigationHUD

NavigationArrow

TurnBanner

SpeedWidget

TripBottomCard

MapControls

NavigationStateMachine

AutoFitEngine

GPSManager

MarkerAnimator

BearingCalculator

RouteProgressTracker

TrafficManager

VoiceGuidance

NavigationEvents
Success Criteria

When this engine is complete:

The entire application will use one navigation implementation.
Every screen will render the same map behavior with different UI overlays.
The driver arrow will always point north while the road rotates beneath it.
Pickup and destination will always auto-fit within the visible map before navigation begins.
Camera movement will feel smooth and predictive rather than reacting to raw GPS updates.
Route recalculation will be intelligent and efficient instead of occurring on every location update.
Driver, customer, and future delivery modules will all share the same Navigation Engine.
One additional feature I'd add

One capability I didn't see in the audit or reference images—but which would noticeably improve the experience—is a Camera State Manager.

Instead of each UI action manipulating the map directly, every interaction requests a camera mode:

FOLLOW_DRIVER
↓

FREE_EXPLORE
↓

FIT_ROUTE

↓

RECENTER

↓

OVERVIEW

If the driver pinches or pans the map:

Camera automatically enters FREE_EXPLORE.
Auto-follow pauses.
A floating "Recenter" button appears.
After inactivity (for example, 5–10 seconds) or when the driver taps Recenter, the camera smoothly returns to FOLLOW_DRIVER.