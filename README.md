# Problem Statement

Your group chat can't decide on anything. Everyone has different constraints, preferences, and schedules. How can you coordinate a meetup that works for everyone?

## The Solution

By operationalizing everyone's needs and representing their preferences through AI agents, we can create a system that plans the ultimate hangout experience.

The first version of this tool is a web application that plans a meal for a group of people.

# Implementation Plan

## Inputs

The system takes the following inputs.

1. Planned day of the meal (e.g. "Friday")
2. For each person in the group:
   - Name
   - Availability for the day in question (e.g. "4:00 PM - 10:00 PM")
   - Departing location (where will they be coming from when they leave to go to the meal)
   - Preferences for the meal (e.g. "must have gluten free options" or "no more than $25 per person" or "must be within 10 minutes of my house")

## Outputs

Proposed meal time and location.