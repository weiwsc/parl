using System.Text.Json;
using static ParliamentApi.Sync.JsonElementReader;

namespace ParliamentApi.Sync;

public static class DocumentReferenceValidator
{
    public static IReadOnlyList<DocumentReferenceIssue> FindIssues(string bodyJson)
    {
        using var document = JsonDocument.Parse(bodyJson);
        var root = document.RootElement;
        var index = BuildIndex(root);
        var references = new JsonReferenceValidationContext();

        CheckFactionReferences(root, index, references);
        CheckAllianceReferences(root, index, references);
        CheckRegionReferences(root, index, references);
        CheckLawReferences(root, index, references);
        CheckEventIssueReferences(root, index, references);
        CheckSenateReferences(root, index, references);
        CheckNodeReferences(root, index, references);

        return references.Issues;
    }

    private static DocumentReferenceIndex BuildIndex(JsonElement root) => new(
        CollectIds(root, "strata"),
        CollectIds(root, "factions"),
        CollectIds(root, "alliances"),
        TryGet(root, ["map", "regions"], out var regionArray) ? CollectIds(regionArray) : [],
        CollectIds(root, "events"),
        TryGet(root, ["nodes", "types"], out var typeArray) ? CollectIds(typeArray) : [],
        TryGet(root, ["nodes", "graph", "nodes"], out var graphNodeArray) ? CollectIds(graphNodeArray) : [],
        TryGet(root, ["nodes", "transforms"], out var transformArray) ? CollectIds(transformArray) : []);

    private static void CheckFactionReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetArray(root, ["factions"], out var factionArray)) return;

        var factionIndex = 0;
        foreach (var faction in factionArray.EnumerateArray())
        {
            if (TryGetArray(faction, ["globalModifiers"], out var modifiers))
            {
                CheckModifierStrata(modifiers, index.Strata, $"factions[{factionIndex}].globalModifiers", references);
            }

            factionIndex += 1;
        }
    }

    private static void CheckAllianceReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetArray(root, ["alliances"], out var alliances)) return;

        var allianceIndex = 0;
        foreach (var alliance in alliances.EnumerateArray())
        {
            if (TryGetArray(alliance, ["factionIds"], out var factionIds))
            {
                references.CheckStringArrayReferences(
                    factionIds,
                    index.Factions,
                    "faction",
                    $"alliances[{allianceIndex}].factionIds");
            }

            allianceIndex += 1;
        }
    }

    private static void CheckRegionReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetArray(root, ["map", "regions"], out var regions)) return;

        var regionIndex = 0;
        foreach (var region in regions.EnumerateArray())
        {
            var regionPath = $"map.regions[{regionIndex}]";

            if (TryGetArray(region, ["factionControl"], out var controlEntries))
            {
                var controlIndex = 0;
                foreach (var control in controlEntries.EnumerateArray())
                {
                    references.CheckStringReference(
                        control,
                        "factionId",
                        index.Factions,
                        "faction",
                        $"{regionPath}.factionControl[{controlIndex}].factionId");
                    controlIndex += 1;
                }
            }

            if (TryGetObject(region, ["strataWeights"], out var strataWeights))
            {
                references.CheckObjectKeyReferences(strataWeights, index.Strata, "stratum", $"{regionPath}.strataWeights");
            }

            if (TryGetObject(region, ["factionSupport"], out var factionSupport))
            {
                foreach (var factionSupportProperty in factionSupport.EnumerateObject())
                {
                    references.CheckReference(
                        factionSupportProperty.Name,
                        index.Factions,
                        "faction",
                        $"{regionPath}.factionSupport.{factionSupportProperty.Name}");

                    if (factionSupportProperty.Value.ValueKind == JsonValueKind.Object)
                    {
                        references.CheckObjectKeyReferences(
                            factionSupportProperty.Value,
                            index.Strata,
                            "stratum",
                            $"{regionPath}.factionSupport.{factionSupportProperty.Name}");
                    }
                }
            }

            if (TryGetArray(region, ["electionModifiers"], out var modifiers))
            {
                var modifierIndex = 0;
                foreach (var modifier in modifiers.EnumerateArray())
                {
                    references.CheckStringReference(
                        modifier,
                        "factionId",
                        index.Factions,
                        "faction",
                        $"{regionPath}.electionModifiers[{modifierIndex}].factionId");
                    modifierIndex += 1;
                }

                CheckModifierStrata(modifiers, index.Strata, $"{regionPath}.electionModifiers", references);
            }

            regionIndex += 1;
        }
    }

    private static void CheckLawReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetArray(root, ["laws"], out var laws)) return;

        var lawIndex = 0;
        foreach (var law in laws.EnumerateArray())
        {
            if (TryGetObject(law, ["factionStances"], out var factionStances))
            {
                references.CheckObjectKeyReferences(factionStances, index.Factions, "faction", $"laws[{lawIndex}].factionStances");
            }

            if (TryGetObject(law, ["senateFactionStances"], out var senateFactionStances))
            {
                references.CheckObjectKeyReferences(senateFactionStances, index.Factions, "faction", $"laws[{lawIndex}].senateFactionStances");
            }

            lawIndex += 1;
        }
    }

    private static void CheckEventIssueReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetArray(root, ["eventSettings", "issues"], out var issuesArray)) return;

        var issueIndex = 0;
        foreach (var issue in issuesArray.EnumerateArray())
        {
            if (TryGetArray(issue, ["eventIds"], out var eventIds))
            {
                references.CheckStringArrayReferences(
                    eventIds,
                    index.Events,
                    "event",
                    $"eventSettings.issues[{issueIndex}].eventIds");
            }

            issueIndex += 1;
        }
    }

    private static void CheckSenateReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (TryGetObject(root, ["senate", "factionSeats"], out var factionSeats))
        {
            references.CheckObjectKeyReferences(factionSeats, index.Factions, "faction", "senate.factionSeats");
        }
    }

    private static void CheckNodeReferences(
        JsonElement root,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (TryGetArray(root, ["nodes", "types"], out var types))
        {
            var typeIndex = 0;
            foreach (var type in types.EnumerateArray())
            {
                var typePath = $"nodes.types[{typeIndex}]";
                if (TryGetArray(type, ["children"], out var children))
                {
                    CheckSchemaChildren(children, index.NodeTypes, $"{typePath}.children", references);
                }

                if (TryGetArray(type, ["methods"], out var methods))
                {
                    CheckTransformDefinitions(methods, index.NodeTypes, $"{typePath}.methods", references);
                }

                typeIndex += 1;
            }
        }

        if (TryGetArray(root, ["nodes", "transforms"], out var transforms))
        {
            CheckTransformDefinitions(transforms, index.NodeTypes, "nodes.transforms", references);
        }

        if (TryGetArray(root, ["nodes", "graph", "nodes"], out var graphNodeArray))
        {
            var nodeIndex = 0;
            foreach (var node in graphNodeArray.EnumerateArray())
            {
                var nodePath = $"nodes.graph.nodes[{nodeIndex}]";
                if (StringProperty(node, "kind") == "entity")
                {
                    references.CheckStringReference(node, "typeId", index.NodeTypes, "nodeType", $"{nodePath}.typeId");
                    CheckEntityBindingReference(node, $"{nodePath}.binding", index, references);
                }
                else if (StringProperty(node, "kind") == "transform")
                {
                    references.CheckStringReference(
                        node,
                        "transformId",
                        index.NodeTransforms,
                        "nodeTransform",
                        $"{nodePath}.transformId",
                        allowEmpty: true);

                    if (TryGetArray(node, ["inputs"], out var inputs))
                    {
                        CheckTransformPorts(inputs, index.NodeTypes, $"{nodePath}.inputs", references);
                    }

                    if (TryGetArray(node, ["outputs"], out var outputs))
                    {
                        CheckTransformPorts(outputs, index.NodeTypes, $"{nodePath}.outputs", references);
                    }
                }

                nodeIndex += 1;
            }
        }

        if (TryGetArray(root, ["nodes", "graph", "connections"], out var connections))
        {
            var connectionIndex = 0;
            foreach (var connection in connections.EnumerateArray())
            {
                CheckNodePortReference(
                    connection,
                    "from",
                    index.GraphNodes,
                    $"nodes.graph.connections[{connectionIndex}].from.nodeId",
                    references);
                CheckNodePortReference(
                    connection,
                    "to",
                    index.GraphNodes,
                    $"nodes.graph.connections[{connectionIndex}].to.nodeId",
                    references);
                connectionIndex += 1;
            }
        }
    }

    private static void CheckEntityBindingReference(
        JsonElement node,
        string sourcePath,
        DocumentReferenceIndex index,
        JsonReferenceValidationContext references)
    {
        if (!TryGetObject(node, ["binding"], out var binding)) return;

        var entityClass = StringProperty(binding, "entityClass");
        var entityId = StringProperty(binding, "entityId");
        if (string.IsNullOrWhiteSpace(entityClass) || string.IsNullOrWhiteSpace(entityId)) return;

        var (targetType, existingIds) = entityClass switch
        {
            "faction" => ("faction", index.Factions),
            "alliance" => ("alliance", index.Alliances),
            "stratum" => ("stratum", index.Strata),
            "region" => ("region", index.Regions),
            _ => (null, null),
        };

        if (targetType is null || existingIds is null) return;

        references.CheckReference(entityId, existingIds, targetType, $"{sourcePath}.entityId");
    }

    private static void CheckNodePortReference(
        JsonElement connection,
        string side,
        ISet<string> graphNodes,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        if (!TryGetObject(connection, [side], out var portRef)) return;
        references.CheckStringReference(portRef, "nodeId", graphNodes, "nodeGraphNode", sourcePath);
    }

    private static void CheckSchemaChildren(
        JsonElement children,
        ISet<string> nodeTypes,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        var childIndex = 0;
        foreach (var child in children.EnumerateArray())
        {
            var childPath = $"{sourcePath}[{childIndex}]";
            switch (StringProperty(child, "kind"))
            {
                case "section":
                    if (TryGetArray(child, ["children"], out var sectionChildren))
                    {
                        CheckSchemaChildren(sectionChildren, nodeTypes, $"{childPath}.children", references);
                    }
                    break;
                case "reference":
                    references.CheckStringReference(child, "typeId", nodeTypes, "nodeType", $"{childPath}.typeId");
                    break;
                case "array":
                    if (TryGetObject(child, ["item"], out var item) && StringProperty(item, "kind") == "reference")
                    {
                        references.CheckStringReference(item, "typeId", nodeTypes, "nodeType", $"{childPath}.item.typeId");
                    }
                    break;
            }

            childIndex += 1;
        }
    }

    private static void CheckTransformDefinitions(
        JsonElement transforms,
        ISet<string> nodeTypes,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        var transformIndex = 0;
        foreach (var transform in transforms.EnumerateArray())
        {
            if (TryGetArray(transform, ["inputs"], out var inputs))
            {
                CheckTransformPorts(inputs, nodeTypes, $"{sourcePath}[{transformIndex}].inputs", references);
            }

            if (TryGetArray(transform, ["outputs"], out var outputs))
            {
                CheckTransformPorts(outputs, nodeTypes, $"{sourcePath}[{transformIndex}].outputs", references);
            }

            transformIndex += 1;
        }
    }

    private static void CheckTransformPorts(
        JsonElement ports,
        ISet<string> nodeTypes,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        var portIndex = 0;
        foreach (var port in ports.EnumerateArray())
        {
            if (TryGetObject(port, ["valueType"], out var valueType))
            {
                CheckNodeValueType(valueType, nodeTypes, $"{sourcePath}[{portIndex}].valueType", references);
            }

            portIndex += 1;
        }
    }

    private static void CheckNodeValueType(
        JsonElement valueType,
        ISet<string> nodeTypes,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        switch (StringProperty(valueType, "kind"))
        {
            case "reference":
                references.CheckStringReference(valueType, "typeId", nodeTypes, "nodeType", $"{sourcePath}.typeId");
                break;
            case "array":
                if (TryGetObject(valueType, ["item"], out var item) && StringProperty(item, "kind") == "reference")
                {
                    references.CheckStringReference(item, "typeId", nodeTypes, "nodeType", $"{sourcePath}.item.typeId");
                }
                break;
        }
    }

    private static void CheckModifierStrata(
        JsonElement modifiers,
        ISet<string> strata,
        string sourcePath,
        JsonReferenceValidationContext references)
    {
        var modifierIndex = 0;
        foreach (var modifier in modifiers.EnumerateArray())
        {
            if (TryGetArray(modifier, ["stratumIds"], out var stratumIds))
            {
                references.CheckStringArrayReferences(
                    stratumIds,
                    strata,
                    "stratum",
                    $"{sourcePath}[{modifierIndex}].stratumIds");
            }

            modifierIndex += 1;
        }
    }
}

internal sealed record DocumentReferenceIndex(
    ISet<string> Strata,
    ISet<string> Factions,
    ISet<string> Alliances,
    ISet<string> Regions,
    ISet<string> Events,
    ISet<string> NodeTypes,
    ISet<string> GraphNodes,
    ISet<string> NodeTransforms);
