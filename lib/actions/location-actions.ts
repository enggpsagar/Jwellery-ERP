"use server"

import { prisma } from "@/lib/prisma"

export type StateOption = {
  id: string
  name: string
  isoCode: string
}

export type CityOption = {
  id: string
  name: string
  stateId: string
}

export async function getStates(): Promise<StateOption[]> {
  const states = await prisma.state.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isoCode: true,
    },
  })

  return states
}

export async function getCitiesByStateId(stateId: string): Promise<CityOption[]> {
  if (!stateId) return []

  const cities = await prisma.city.findMany({
    where: { stateId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stateId: true,
    },
  })

  return cities
}